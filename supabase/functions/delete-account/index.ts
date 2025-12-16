import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-ACCOUNT] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw userError;
    
    const user = userData.user;
    logStep('User authenticated', { userId: user.id, email: user.email });

    // Get user's profile and workspace
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;
    if (!profile?.workspace_id) throw new Error('No workspace found for user');

    const workspaceId = profile.workspace_id;
    logStep('Found workspace', { workspaceId });

    // Get workspace details for Stripe cancellation
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('stripe_customer_id, owner_id')
      .eq('id', workspaceId)
      .single();

    if (workspaceError) throw workspaceError;

    // Cancel Stripe subscription if exists
    if (workspace.stripe_customer_id) {
      try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
          apiVersion: '2023-10-16',
        });

        logStep('Canceling Stripe subscriptions', { customerId: workspace.stripe_customer_id });

        // Cancel all active, trialing, and past_due subscriptions
        const statusesToCancel = ['active', 'trialing', 'past_due'] as const;
        
        for (const status of statusesToCancel) {
          const subscriptions = await stripe.subscriptions.list({
            customer: workspace.stripe_customer_id,
            status: status,
          });

          for (const subscription of subscriptions.data) {
            await stripe.subscriptions.cancel(subscription.id);
            logStep('Canceled subscription', { subscriptionId: subscription.id, status });
          }
        }
      } catch (stripeError: any) {
        logStep('Stripe cancellation error (continuing)', { error: stripeError.message });
        // Continue with deletion even if Stripe fails
      }
    }

    // Delete workspace data (cascade will handle related records)
    // Order matters due to foreign key constraints
    
    // 1. Delete generated outputs
    const { error: outputsError } = await supabase
      .from('generated_outputs')
      .delete()
      .eq('workspace_id', workspaceId);
    if (outputsError) logStep('Error deleting generated_outputs', { error: outputsError });

    // 2. Delete merge jobs
    const { error: jobsError } = await supabase
      .from('merge_jobs')
      .delete()
      .eq('workspace_id', workspaceId);
    if (jobsError) logStep('Error deleting merge_jobs', { error: jobsError });

    // 3. Delete usage logs
    const { error: usageError } = await supabase
      .from('usage_logs')
      .delete()
      .eq('workspace_id', workspaceId);
    if (usageError) logStep('Error deleting usage_logs', { error: usageError });

    // 4. Delete field mappings (related to projects)
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId);

    if (projects) {
      for (const project of projects) {
        await supabase
          .from('field_mappings')
          .delete()
          .eq('project_id', project.id);
      }
    }

    // 5. Delete data sources
    const { error: dataSourcesError } = await supabase
      .from('data_sources')
      .delete()
      .eq('workspace_id', workspaceId);
    if (dataSourcesError) logStep('Error deleting data_sources', { error: dataSourcesError });

    // 6. Delete templates
    const { error: templatesError } = await supabase
      .from('templates')
      .delete()
      .eq('workspace_id', workspaceId);
    if (templatesError) logStep('Error deleting templates', { error: templatesError });

    // 7. Delete projects
    const { error: projectsError } = await supabase
      .from('projects')
      .delete()
      .eq('workspace_id', workspaceId);
    if (projectsError) logStep('Error deleting projects', { error: projectsError });

    // 8. Delete stripe subscriptions record
    const { error: stripeSubsError } = await supabase
      .from('stripe_subscriptions')
      .delete()
      .eq('workspace_id', workspaceId);
    if (stripeSubsError) logStep('Error deleting stripe_subscriptions', { error: stripeSubsError });

    // 9. Delete user roles
    const { error: rolesError } = await supabase
      .from('user_roles')
      .delete()
      .eq('workspace_id', workspaceId);
    if (rolesError) logStep('Error deleting user_roles', { error: rolesError });

    // 10. Delete profile
    const { error: profileDeleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);
    if (profileDeleteError) logStep('Error deleting profile', { error: profileDeleteError });

    // 11. Delete workspace
    const { error: workspaceDeleteError } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);
    if (workspaceDeleteError) logStep('Error deleting workspace', { error: workspaceDeleteError });

    // 12. Finally, delete auth user
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (authDeleteError) throw authDeleteError;

    logStep('Account deleted successfully', { userId: user.id });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    logStep('ERROR', { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
