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

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Fallback tier config in case DB lookup fails
const TIER_CONFIG: Record<string, { tier: string; pagesPerMonth: number }> = {
  // Current active price IDs
  'price_1SU3IAQPrjyVLvmxvLo5G5QY': { tier: 'pro', pagesPerMonth: 500 },
  'price_1SU3NAQPrjyVLvmxA827EA4Y': { tier: 'business', pagesPerMonth: 5000 },
  // Legacy price IDs
  'price_1Sd8GJQPrjyVLvmxAW0x0aXN': { tier: 'pro', pagesPerMonth: 500 },
  'price_1Sd8GqQPrjyVLvmxOplFKFgb': { tier: 'business', pagesPerMonth: 5000 },
};

// Find workspace by customer ID with fallbacks
async function findWorkspaceByCustomer(supabase: any, customerId: string, customerEmail?: string): Promise<string | null> {
  logStep('Finding workspace for customer', { customerId, customerEmail });
  
  // Try 1: Direct lookup by stripe_customer_id
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (workspace) {
    logStep('Found workspace by stripe_customer_id', { workspaceId: workspace.id });
    return workspace.id;
  }

  // Try 2: Lookup by customer email -> profile -> workspace
  if (customerEmail) {
    logStep('Trying fallback lookup by email', { email: customerEmail });
    
    // Get user by email from auth.users via profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('workspace_id, id')
      .limit(100);
    
    if (profiles) {
      // Get the auth user by email
      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUser = authData?.users?.find((u: any) => u.email === customerEmail);
      
      if (authUser) {
        const profile = profiles.find((p: any) => p.id === authUser.id);
        if (profile?.workspace_id) {
          logStep('Found workspace by email fallback', { workspaceId: profile.workspace_id });
          
          // Update workspace with stripe_customer_id for future lookups
          await supabase
            .from('workspaces')
            .update({ stripe_customer_id: customerId })
            .eq('id', profile.workspace_id);
          
          logStep('Updated workspace with stripe_customer_id');
          return profile.workspace_id;
        }
      }
    }
  }

  logStep('No workspace found for customer');
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  logStep('Webhook received', { 
    hasSignature: !!signature, 
    hasSecret: !!webhookSecret 
  });

  if (!signature || !webhookSecret) {
    logStep('ERROR: Missing signature or webhook secret');
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    
    logStep('Event verified', { type: event.type, id: event.id });

    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        logStep('Processing subscription event', { 
          eventType: event.type,
          subscriptionId: subscription.id, 
          customerId,
          status: subscription.status 
        });

        // Get customer email for fallback lookup
        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = (customer as Stripe.Customer).email || undefined;

        const workspaceId = await findWorkspaceByCustomer(supabase, customerId, customerEmail);

        if (!workspaceId) {
          logStep('ERROR: Workspace not found for customer', { customerId, customerEmail });
          break;
        }

        // Determine tier from price ID (DB lookup with fallback)
        const priceId = subscription.items.data[0].price.id;
        logStep('Looking up tier for price', { priceId });
        
        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('tier_name, pages_per_month')
          .eq('stripe_price_id', priceId)
          .single();

        // Use DB tier or fallback to hardcoded config
        const fallbackTier = TIER_CONFIG[priceId];
        const tierName = tier?.tier_name || fallbackTier?.tier || 'starter';
        const pagesQuota = tier?.pages_per_month || fallbackTier?.pagesPerMonth || 100;

        logStep('Tier lookup result', { tier, fallbackTier, tierName, pagesQuota });

        // Update workspace subscription
        const updateData: any = {
          subscription_tier: tierName,
          subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
          pages_quota: pagesQuota,
        };
        
        // Set trial end date if subscription has a trial period
        if (subscription.trial_end) {
          updateData.trial_end_date = new Date(subscription.trial_end * 1000).toISOString();
        } else if (subscription.status === 'active') {
          updateData.trial_end_date = null;
        }
        
        logStep('Updating workspace', { workspaceId, updateData });
        
        const { error: updateError } = await supabase
          .from('workspaces')
          .update(updateData)
          .eq('id', workspaceId);

        if (updateError) {
          logStep('ERROR: Failed to update workspace', { error: updateError });
        } else {
          logStep('Workspace updated successfully');
        }

        // Upsert stripe subscription record
        const { error: upsertError } = await supabase
          .from('stripe_subscriptions')
          .upsert({
            workspace_id: workspaceId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          });

        if (upsertError) {
          logStep('ERROR: Failed to upsert stripe_subscriptions', { error: upsertError });
        } else {
          logStep('Stripe subscription record upserted');
        }

        logStep('Subscription event processed successfully', { workspaceId });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        logStep('Processing subscription deletion', { 
          subscriptionId: subscription.id, 
          customerId 
        });

        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = (customer as Stripe.Customer).email || undefined;

        const workspaceId = await findWorkspaceByCustomer(supabase, customerId, customerEmail);

        if (workspaceId) {
          // Downgrade to free tier
          await supabase
            .from('workspaces')
            .update({
              subscription_tier: 'starter',
              subscription_status: 'canceled',
              pages_quota: 100,
            })
            .eq('id', workspaceId);

          // Update subscription record
          await supabase
            .from('stripe_subscriptions')
            .update({
              status: 'canceled',
              cancel_at_period_end: true,
            })
            .eq('stripe_subscription_id', subscription.id);

          logStep('Subscription canceled for workspace', { workspaceId });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        logStep('Payment succeeded', { invoiceId: invoice.id });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        logStep('Payment failed', { invoiceId: invoice.id, customerId });

        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = (customer as Stripe.Customer).email || undefined;

        const workspaceId = await findWorkspaceByCustomer(supabase, customerId, customerEmail);

        if (workspaceId) {
          await supabase
            .from('workspaces')
            .update({ subscription_status: 'past_due' })
            .eq('id', workspaceId);

          logStep('Workspace marked as past_due', { workspaceId });
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep('Checkout session completed', { 
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription
        });
        // Subscription events will handle the actual update
        break;
      }

      default:
        logStep('Unhandled event type', { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    logStep('ERROR: Webhook processing failed', { 
      error: err instanceof Error ? err.message : 'Unknown error' 
    });
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
