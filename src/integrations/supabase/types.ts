export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      data_sources: {
        Row: {
          ai_field_analysis: Json | null
          created_at: string
          file_url: string | null
          google_sheet_url: string | null
          id: string
          parsed_fields: Json | null
          project_id: string
          row_count: number
          source_type: Database["public"]["Enums"]["data_source_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_field_analysis?: Json | null
          created_at?: string
          file_url?: string | null
          google_sheet_url?: string | null
          id?: string
          parsed_fields?: Json | null
          project_id: string
          row_count?: number
          source_type: Database["public"]["Enums"]["data_source_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_field_analysis?: Json | null
          created_at?: string
          file_url?: string | null
          google_sheet_url?: string | null
          id?: string
          parsed_fields?: Json | null
          project_id?: string
          row_count?: number
          source_type?: Database["public"]["Enums"]["data_source_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mappings: {
        Row: {
          ai_confidence_score: number | null
          created_at: string
          data_source_id: string
          id: string
          mappings: Json | null
          project_id: string
          template_id: string
          updated_at: string
          user_confirmed: boolean
        }
        Insert: {
          ai_confidence_score?: number | null
          created_at?: string
          data_source_id: string
          id?: string
          mappings?: Json | null
          project_id: string
          template_id: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Update: {
          ai_confidence_score?: number | null
          created_at?: string
          data_source_id?: string
          id?: string
          mappings?: Json | null
          project_id?: string
          template_id?: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_outputs: {
        Row: {
          created_at: string
          download_count: number
          expires_at: string | null
          file_size_bytes: number
          file_url: string
          id: string
          merge_job_id: string
          page_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          expires_at?: string | null
          file_size_bytes: number
          file_url: string
          id?: string
          merge_job_id: string
          page_count: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          download_count?: number
          expires_at?: string | null
          file_size_bytes?: number
          file_url?: string
          id?: string
          merge_job_id?: string
          page_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_outputs_merge_job_id_fkey"
            columns: ["merge_job_id"]
            isOneToOne: false
            referencedRelation: "merge_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_outputs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          assigned_page_id: string | null
          created_at: string
          difficulty: number | null
          id: string
          keyword: string
          notes: string | null
          search_volume: number | null
          status: string
        }
        Insert: {
          assigned_page_id?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          keyword: string
          notes?: string | null
          search_volume?: number | null
          status?: string
        }
        Update: {
          assigned_page_id?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          keyword?: string
          notes?: string | null
          search_volume?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_assigned_page_id_fkey"
            columns: ["assigned_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      label_overrides: {
        Row: {
          created_at: string | null
          data_source_id: string
          field_overrides: Json
          id: string
          label_index: number
          template_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_source_id: string
          field_overrides?: Json
          id?: string
          label_index: number
          template_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_source_id?: string
          field_overrides?: Json
          id?: string
          label_index?: number
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "label_overrides_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_overrides_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      label_templates: {
        Row: {
          brand: string
          categories: string[] | null
          columns: number
          corner_radius_mm: number | null
          created_at: string | null
          description: string | null
          equivalent_to: string | null
          gap_x_mm: number | null
          gap_y_mm: number | null
          id: string
          label_height_mm: number
          label_shape: string
          label_width_mm: number
          labels_per_sheet: number | null
          margin_left_mm: number
          margin_top_mm: number
          paper_size: string
          part_number: string
          region: string
          rows: number
          spacing_x_mm: number
          spacing_y_mm: number
        }
        Insert: {
          brand: string
          categories?: string[] | null
          columns: number
          corner_radius_mm?: number | null
          created_at?: string | null
          description?: string | null
          equivalent_to?: string | null
          gap_x_mm?: number | null
          gap_y_mm?: number | null
          id?: string
          label_height_mm: number
          label_shape?: string
          label_width_mm: number
          labels_per_sheet?: number | null
          margin_left_mm: number
          margin_top_mm: number
          paper_size: string
          part_number: string
          region?: string
          rows: number
          spacing_x_mm: number
          spacing_y_mm: number
        }
        Update: {
          brand?: string
          categories?: string[] | null
          columns?: number
          corner_radius_mm?: number | null
          created_at?: string | null
          description?: string | null
          equivalent_to?: string | null
          gap_x_mm?: number | null
          gap_y_mm?: number | null
          id?: string
          label_height_mm?: number
          label_shape?: string
          label_width_mm?: number
          labels_per_sheet?: number | null
          margin_left_mm?: number
          margin_top_mm?: number
          paper_size?: string
          part_number?: string
          region?: string
          rows?: number
          spacing_x_mm?: number
          spacing_y_mm?: number
        }
        Relationships: []
      }
      merge_jobs: {
        Row: {
          created_at: string
          data_source_id: string
          error_message: string | null
          id: string
          output_url: string | null
          processed_pages: number
          processing_completed_at: string | null
          processing_started_at: string | null
          project_id: string
          status: Database["public"]["Enums"]["job_status"]
          template_id: string
          total_pages: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data_source_id: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          processed_pages?: number
          processing_completed_at?: string | null
          processing_started_at?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["job_status"]
          template_id: string
          total_pages: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          data_source_id?: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          processed_pages?: number
          processing_completed_at?: string | null
          processing_started_at?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          template_id?: string
          total_pages?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merge_jobs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed: boolean
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ai_suggestions: Json | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_suggestions?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_suggestions?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_internal_links: {
        Row: {
          anchor_text: string
          created_at: string
          id: string
          relevance_score: number | null
          source_page_id: string
          target_page_id: string
        }
        Insert: {
          anchor_text: string
          created_at?: string
          id?: string
          relevance_score?: number | null
          source_page_id: string
          target_page_id: string
        }
        Update: {
          anchor_text?: string
          created_at?: string
          id?: string
          relevance_score?: number | null
          source_page_id?: string
          target_page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_internal_links_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_internal_links_target_page_id_fkey"
            columns: ["target_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_pages: {
        Row: {
          content_blocks: Json | null
          created_at: string
          h1: string
          hero_summary: string | null
          id: string
          is_published: boolean
          last_updated: string
          meta_description: string
          page_type: Database["public"]["Enums"]["seo_page_type"]
          published_at: string | null
          schema_markup: Json | null
          slug: string
          target_keyword: string | null
          title: string
        }
        Insert: {
          content_blocks?: Json | null
          created_at?: string
          h1: string
          hero_summary?: string | null
          id?: string
          is_published?: boolean
          last_updated?: string
          meta_description: string
          page_type: Database["public"]["Enums"]["seo_page_type"]
          published_at?: string | null
          schema_markup?: Json | null
          slug: string
          target_keyword?: string | null
          title: string
        }
        Update: {
          content_blocks?: Json | null
          created_at?: string
          h1?: string
          hero_summary?: string | null
          id?: string
          is_published?: boolean
          last_updated?: string
          meta_description?: string
          page_type?: Database["public"]["Enums"]["seo_page_type"]
          published_at?: string | null
          schema_markup?: Json | null
          slug?: string
          target_keyword?: string | null
          title?: string
        }
        Relationships: []
      }
      seo_templates: {
        Row: {
          created_at: string
          default_content_blocks: Json | null
          fields_schema: Json | null
          id: string
          name: string
          page_type: Database["public"]["Enums"]["seo_page_type"]
          schema_template: Json | null
        }
        Insert: {
          created_at?: string
          default_content_blocks?: Json | null
          fields_schema?: Json | null
          id?: string
          name: string
          page_type: Database["public"]["Enums"]["seo_page_type"]
          schema_template?: Json | null
        }
        Update: {
          created_at?: string
          default_content_blocks?: Json | null
          fields_schema?: Json | null
          id?: string
          name?: string
          page_type?: Database["public"]["Enums"]["seo_page_type"]
          schema_template?: Json | null
        }
        Relationships: []
      }
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_tiers: {
        Row: {
          created_at: string
          display_name: string
          features: Json | null
          id: string
          is_active: boolean
          pages_per_month: number
          price_cents: number
          stripe_price_id: string | null
          tier_name: Database["public"]["Enums"]["subscription_tier"]
        }
        Insert: {
          created_at?: string
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean
          pages_per_month: number
          price_cents: number
          stripe_price_id?: string | null
          tier_name: Database["public"]["Enums"]["subscription_tier"]
        }
        Update: {
          created_at?: string
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean
          pages_per_month?: number
          price_cents?: number
          stripe_price_id?: string | null
          tier_name?: Database["public"]["Enums"]["subscription_tier"]
        }
        Relationships: []
      }
      templates: {
        Row: {
          ai_layout_suggestions: Json | null
          bleed_mm: number | null
          created_at: string
          design_config: Json | null
          file_url: string | null
          height_mm: number | null
          id: string
          is_public: boolean
          name: string
          preview_url: string | null
          project_id: string | null
          template_type: Database["public"]["Enums"]["template_type"]
          updated_at: string
          width_mm: number | null
          workspace_id: string | null
        }
        Insert: {
          ai_layout_suggestions?: Json | null
          bleed_mm?: number | null
          created_at?: string
          design_config?: Json | null
          file_url?: string | null
          height_mm?: number | null
          id?: string
          is_public?: boolean
          name: string
          preview_url?: string | null
          project_id?: string | null
          template_type: Database["public"]["Enums"]["template_type"]
          updated_at?: string
          width_mm?: number | null
          workspace_id?: string | null
        }
        Update: {
          ai_layout_suggestions?: Json | null
          bleed_mm?: number | null
          created_at?: string
          design_config?: Json | null
          file_url?: string | null
          height_mm?: number | null
          id?: string
          is_public?: boolean
          name?: string
          preview_url?: string | null
          project_id?: string | null
          template_type?: Database["public"]["Enums"]["template_type"]
          updated_at?: string
          width_mm?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          billed_at: string
          billing_cycle_month: string
          created_at: string
          id: string
          merge_job_id: string | null
          pages_generated: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          billed_at?: string
          billing_cycle_month: string
          created_at?: string
          id?: string
          merge_job_id?: string | null
          pages_generated: number
          user_id: string
          workspace_id: string
        }
        Update: {
          billed_at?: string
          billing_cycle_month?: string
          created_at?: string
          id?: string
          merge_job_id?: string | null
          pages_generated?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_merge_job_id_fkey"
            columns: ["merge_job_id"]
            isOneToOne: false
            referencedRelation: "merge_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          billing_cycle_start: string
          created_at: string
          id: string
          name: string
          owner_id: string
          pages_quota: number
          pages_used_this_month: number
          slug: string
          stripe_customer_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          trial_end_date: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle_start?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          pages_quota?: number
          pages_used_this_month?: number
          slug: string
          stripe_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_end_date?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle_start?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          pages_quota?: number
          pages_used_this_month?: number
          slug?: string
          stripe_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_end_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_workspace_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      data_source_type: "csv" | "excel" | "google_sheet" | "manual"
      job_status: "queued" | "processing" | "complete" | "error"
      project_status:
        | "draft"
        | "mapping"
        | "ready"
        | "generating"
        | "complete"
        | "error"
      project_type:
        | "label"
        | "certificate"
        | "card"
        | "shelf_strip"
        | "badge"
        | "custom"
      seo_page_type:
        | "template"
        | "how_to"
        | "comparison"
        | "industry"
        | "use_case"
        | "avery_label"
      subscription_status: "active" | "canceled" | "past_due" | "trialing"
      subscription_tier: "starter" | "pro" | "business"
      template_type:
        | "uploaded_pdf"
        | "uploaded_image"
        | "built_in_library"
        | "ai_generated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      data_source_type: ["csv", "excel", "google_sheet", "manual"],
      job_status: ["queued", "processing", "complete", "error"],
      project_status: [
        "draft",
        "mapping",
        "ready",
        "generating",
        "complete",
        "error",
      ],
      project_type: [
        "label",
        "certificate",
        "card",
        "shelf_strip",
        "badge",
        "custom",
      ],
      seo_page_type: [
        "template",
        "how_to",
        "comparison",
        "industry",
        "use_case",
        "avery_label",
      ],
      subscription_status: ["active", "canceled", "past_due", "trialing"],
      subscription_tier: ["starter", "pro", "business"],
      template_type: [
        "uploaded_pdf",
        "uploaded_image",
        "built_in_library",
        "ai_generated",
      ],
    },
  },
} as const
