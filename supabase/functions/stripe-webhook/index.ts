import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    console.error('Missing signature or webhook secret');
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    
    console.log('Webhook event type:', event.type);

    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        // Get workspace by stripe customer ID
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!workspace) {
          console.error('Workspace not found for customer:', customerId);
          break;
        }

        // Determine tier from price ID
        const priceId = subscription.items.data[0].price.id;
        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('tier_name, pages_per_month')
          .eq('stripe_price_id', priceId)
          .single();

        // Update workspace subscription
        await supabase
          .from('workspaces')
          .update({
            subscription_tier: tier?.tier_name || 'starter',
            subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
            pages_quota: tier?.pages_per_month || 100,
          })
          .eq('id', workspace.id);

        // Upsert stripe subscription record
        await supabase
          .from('stripe_subscriptions')
          .upsert({
            workspace_id: workspace.id,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          });

        console.log('Subscription updated for workspace:', workspace.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (workspace) {
          // Downgrade to free tier
          await supabase
            .from('workspaces')
            .update({
              subscription_tier: 'starter',
              subscription_status: 'canceled',
              pages_quota: 100,
            })
            .eq('id', workspace.id);

          // Update subscription record
          await supabase
            .from('stripe_subscriptions')
            .update({
              status: 'canceled',
              cancel_at_period_end: true,
            })
            .eq('stripe_subscription_id', subscription.id);

          console.log('Subscription canceled for workspace:', workspace.id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Payment succeeded for invoice:', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (workspace) {
          await supabase
            .from('workspaces')
            .update({ subscription_status: 'past_due' })
            .eq('id', workspace.id);

          console.log('Payment failed for workspace:', workspace.id);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('Webhook error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
