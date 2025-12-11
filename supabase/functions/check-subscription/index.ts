import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Map Stripe price IDs to tiers
const TIER_CONFIG: Record<string, { tier: string; pagesPerMonth: number }> = {
  'price_1Sd8GJQPrjyVLvmxAW0x0aXN': { tier: 'pro', pagesPerMonth: 500 },
  'price_1Sd8GqQPrjyVLvmxOplFKFgb': { tier: 'business', pagesPerMonth: 2000 },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    logStep('User authenticated', { userId: user.id, email: user.email });

    // Get user's workspace
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    if (!profile?.workspace_id) {
      throw new Error('No workspace found');
    }

    const workspaceId = profile.workspace_id;
    logStep('Found workspace', { workspaceId });

    // Get workspace details
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('stripe_customer_id, subscription_tier, subscription_status')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // If no Stripe customer, check by email
    let customerId = workspace.stripe_customer_id;
    
    if (!customerId && user.email) {
      logStep('No customer ID stored, searching by email');
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        // Store the customer ID for future use
        await supabase
          .from('workspaces')
          .update({ stripe_customer_id: customerId })
          .eq('id', workspaceId);
        logStep('Found and stored customer ID', { customerId });
      }
    }

    if (!customerId) {
      logStep('No Stripe customer found, returning current state');
      return new Response(JSON.stringify({
        subscribed: false,
        tier: workspace.subscription_tier,
        status: workspace.subscription_status,
        synced: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep('Checking Stripe subscriptions', { customerId });

    // Get active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      logStep('No active subscription found in Stripe');
      
      // Check if they had a subscription that's now canceled/expired
      const allSubs = await stripe.subscriptions.list({
        customer: customerId,
        limit: 5,
      });
      
      if (allSubs.data.length > 0) {
        const latestSub = allSubs.data[0];
        logStep('Found non-active subscription', { status: latestSub.status });
        
        // If subscription is canceled or past_due, update workspace
        if (latestSub.status === 'canceled' || latestSub.status === 'past_due') {
          await supabase
            .from('workspaces')
            .update({
              subscription_tier: 'starter',
              subscription_status: latestSub.status === 'canceled' ? 'canceled' : 'past_due',
              pages_quota: 100,
            })
            .eq('id', workspaceId);
        }
      }

      return new Response(JSON.stringify({
        subscribed: false,
        tier: 'starter',
        status: 'canceled',
        synced: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const activeSub = subscriptions.data[0];
    const priceId = activeSub.items.data[0]?.price.id;
    
    logStep('Found active subscription', { 
      subscriptionId: activeSub.id, 
      priceId,
      currentPeriodEnd: new Date(activeSub.current_period_end * 1000).toISOString()
    });

    // Determine tier from price ID
    const tierConfig = TIER_CONFIG[priceId] || { tier: 'pro', pagesPerMonth: 500 };
    
    logStep('Determined tier', tierConfig);

    // Update workspace with correct subscription info
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        subscription_tier: tierConfig.tier,
        subscription_status: 'active',
        pages_quota: tierConfig.pagesPerMonth,
        trial_end_date: null,
      })
      .eq('id', workspaceId);

    if (updateError) {
      logStep('Error updating workspace', { error: updateError.message });
      throw updateError;
    }

    // Also update/create stripe_subscriptions record
    const { error: subUpsertError } = await supabase
      .from('stripe_subscriptions')
      .upsert({
        workspace_id: workspaceId,
        stripe_subscription_id: activeSub.id,
        stripe_customer_id: customerId,
        status: activeSub.status,
        current_period_start: new Date(activeSub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: activeSub.cancel_at_period_end,
      }, {
        onConflict: 'stripe_subscription_id',
      });

    if (subUpsertError) {
      logStep('Error upserting subscription record', { error: subUpsertError.message });
    }

    logStep('Successfully synced subscription');

    return new Response(JSON.stringify({
      subscribed: true,
      tier: tierConfig.tier,
      pagesQuota: tierConfig.pagesPerMonth,
      status: 'active',
      currentPeriodEnd: new Date(activeSub.current_period_end * 1000).toISOString(),
      synced: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logStep('ERROR', { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
