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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alert_state: {
        Row: {
          alert_key: string
          last_fired_at: string
          last_value: Json | null
        }
        Insert: {
          alert_key: string
          last_fired_at?: string
          last_value?: Json | null
        }
        Update: {
          alert_key?: string
          last_fired_at?: string
          last_value?: Json | null
        }
        Relationships: []
      }
      ai_call_telemetry: {
        Row: {
          attempt: number
          attempt_number: number | null
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          call_name: string
          completed_at: string | null
          cost_confidence: string | null
          cost_known: boolean | null
          costing_epoch: string | null
          costing_subject_id: string | null
          created_at: string
          duration_ms: number
          environment: string | null
          error_category: string | null
          error_code: string | null
          exclude_from_costing_at_time: boolean | null
          feature: string
          feature_run_id: string | null
          headroom_pct: number | null
          http_status: number | null
          id: number
          incurred_cost_usd: number | null
          input_tokens: number | null
          is_retry: boolean | null
          max_tokens: number
          model: string
          ok: boolean
          operation_name: string | null
          output_chars: number | null
          output_tokens: number | null
          pricing_id: string | null
          provider: string | null
          provider_request_id: string | null
          req_id: string | null
          started_at: string | null
          status: string | null
          stop_reason: string | null
          telemetry_version: string | null
          tier: string
          truncated: boolean | null
          ttfb_ms: number | null
          user_id: string | null
        }
        Insert: {
          attempt?: number
          attempt_number?: number | null
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          call_name: string
          completed_at?: string | null
          cost_confidence?: string | null
          cost_known?: boolean | null
          costing_epoch?: string | null
          costing_subject_id?: string | null
          created_at?: string
          duration_ms: number
          environment?: string | null
          error_category?: string | null
          error_code?: string | null
          exclude_from_costing_at_time?: boolean | null
          feature: string
          feature_run_id?: string | null
          headroom_pct?: number | null
          http_status?: number | null
          id?: number
          incurred_cost_usd?: number | null
          input_tokens?: number | null
          is_retry?: boolean | null
          max_tokens: number
          model: string
          ok: boolean
          operation_name?: string | null
          output_chars?: number | null
          output_tokens?: number | null
          pricing_id?: string | null
          provider?: string | null
          provider_request_id?: string | null
          req_id?: string | null
          started_at?: string | null
          status?: string | null
          stop_reason?: string | null
          telemetry_version?: string | null
          tier: string
          truncated?: boolean | null
          ttfb_ms?: number | null
          user_id?: string | null
        }
        Update: {
          attempt?: number
          attempt_number?: number | null
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          call_name?: string
          completed_at?: string | null
          cost_confidence?: string | null
          cost_known?: boolean | null
          costing_epoch?: string | null
          costing_subject_id?: string | null
          created_at?: string
          duration_ms?: number
          environment?: string | null
          error_category?: string | null
          error_code?: string | null
          exclude_from_costing_at_time?: boolean | null
          feature?: string
          feature_run_id?: string | null
          headroom_pct?: number | null
          http_status?: number | null
          id?: number
          incurred_cost_usd?: number | null
          input_tokens?: number | null
          is_retry?: boolean | null
          max_tokens?: number
          model?: string
          ok?: boolean
          operation_name?: string | null
          output_chars?: number | null
          output_tokens?: number | null
          pricing_id?: string | null
          provider?: string | null
          provider_request_id?: string | null
          req_id?: string | null
          started_at?: string | null
          status?: string | null
          stop_reason?: string | null
          telemetry_version?: string | null
          tier?: string
          truncated?: boolean | null
          ttfb_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_telemetry_costing_subject_id_fkey"
            columns: ["costing_subject_id"]
            isOneToOne: false
            referencedRelation: "costing_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_telemetry_feature_run_id_fkey"
            columns: ["feature_run_id"]
            isOneToOne: false
            referencedRelation: "feature_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_telemetry_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "provider_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_cache: {
        Row: {
          archive_path: string | null
          cache_key: string
          created_at: string
          feature: string
          hit_count: number
          id: string
          last_hit_at: string
          raw_response: Json
          tier: string
          user_id: string
          variant: string | null
        }
        Insert: {
          archive_path?: string | null
          cache_key: string
          created_at?: string
          feature: string
          hit_count?: number
          id?: string
          last_hit_at?: string
          raw_response: Json
          tier: string
          user_id: string
          variant?: string | null
        }
        Update: {
          archive_path?: string | null
          cache_key?: string
          created_at?: string
          feature?: string
          hit_count?: number
          id?: string
          last_hit_at?: string
          raw_response?: Json
          tier?: string
          user_id?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "cohort_peers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "analysis_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          attempts: number
          available_at: string
          calculation_version: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          error: Json | null
          failure_code: string | null
          failure_stage: string | null
          feature: string | null
          function_version: string | null
          id: string
          idempotency_key: string | null
          input_fingerprint: string | null
          input_version: string | null
          job_type: string
          last_error_message: string | null
          last_http_status: number | null
          max_attempts: number
          merit_settled: boolean
          merit_transaction_id: string | null
          model: string | null
          payload: Json
          prompt_version: string | null
          refunded: boolean
          result: Json | null
          retry_count: number
          schema_version: string | null
          state: string | null
          state_updated_at: string | null
          status: string
          tier: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          available_at?: string
          calculation_version?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          failure_code?: string | null
          failure_stage?: string | null
          feature?: string | null
          function_version?: string | null
          id?: string
          idempotency_key?: string | null
          input_fingerprint?: string | null
          input_version?: string | null
          job_type: string
          last_error_message?: string | null
          last_http_status?: number | null
          max_attempts?: number
          merit_settled?: boolean
          merit_transaction_id?: string | null
          model?: string | null
          payload?: Json
          prompt_version?: string | null
          refunded?: boolean
          result?: Json | null
          retry_count?: number
          schema_version?: string | null
          state?: string | null
          state_updated_at?: string | null
          status?: string
          tier?: string | null
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          available_at?: string
          calculation_version?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          failure_code?: string | null
          failure_stage?: string | null
          feature?: string | null
          function_version?: string | null
          id?: string
          idempotency_key?: string | null
          input_fingerprint?: string | null
          input_version?: string | null
          job_type?: string
          last_error_message?: string | null
          last_http_status?: number | null
          max_attempts?: number
          merit_settled?: boolean
          merit_transaction_id?: string | null
          model?: string | null
          payload?: Json
          prompt_version?: string | null
          refunded?: boolean
          result?: Json | null
          retry_count?: number
          schema_version?: string | null
          state?: string | null
          state_updated_at?: string | null
          status?: string
          tier?: string | null
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      analysis_results: {
        Row: {
          analysis_type: string
          archive_path: string | null
          created_at: string
          email_sent_at: string | null
          id: string
          key_insights: Json | null
          primary_score: number | null
          raw_response: Json | null
          source_reference: string | null
          user_id: string
        }
        Insert: {
          analysis_type: string
          archive_path?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          key_insights?: Json | null
          primary_score?: number | null
          raw_response?: Json | null
          source_reference?: string | null
          user_id: string
        }
        Update: {
          analysis_type?: string
          archive_path?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          key_insights?: Json | null
          primary_score?: number | null
          raw_response?: Json | null
          source_reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          analysis_id: string | null
          application_date: string | null
          application_source: string | null
          company_applied: string
          created_at: string
          id: string
          industry: string | null
          jd_id: string | null
          linkedin_version_id: string | null
          location: string | null
          posted: string | null
          referral_used: boolean | null
          resume_version_id: string | null
          role_applied: string
          salary: string | null
          status: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          application_date?: string | null
          application_source?: string | null
          company_applied: string
          created_at?: string
          id?: string
          industry?: string | null
          jd_id?: string | null
          linkedin_version_id?: string | null
          location?: string | null
          posted?: string | null
          referral_used?: boolean | null
          resume_version_id?: string | null
          role_applied: string
          salary?: string | null
          status?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          application_date?: string | null
          application_source?: string | null
          company_applied?: string
          created_at?: string
          id?: string
          industry?: string | null
          jd_id?: string | null
          linkedin_version_id?: string | null
          location?: string | null
          posted?: string | null
          referral_used?: boolean | null
          resume_version_id?: string | null
          role_applied?: string
          salary?: string | null
          status?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_linkedin_version_id_fkey"
            columns: ["linkedin_version_id"]
            isOneToOne: false
            referencedRelation: "linkedin_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          cohort_key: string
          computed_at: string
          id: string
          metric: string
          percentile_25: number | null
          percentile_50: number | null
          percentile_75: number | null
          sample_size: number
        }
        Insert: {
          cohort_key: string
          computed_at?: string
          id?: string
          metric: string
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          sample_size: number
        }
        Update: {
          cohort_key?: string
          computed_at?: string
          id?: string
          metric?: string
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          sample_size?: number
        }
        Relationships: []
      }
      career_targets: {
        Row: {
          career_goals: string | null
          created_at: string
          goal_readiness_components: Json | null
          goal_readiness_computed_at: string | null
          goal_readiness_score: number | null
          id: string
          location_preference: string | null
          professional_goal: string | null
          professional_goal_set_at: string | null
          professional_goal_structured: Json | null
          target_companies: string[]
          target_industries: string[]
          target_roles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          career_goals?: string | null
          created_at?: string
          goal_readiness_components?: Json | null
          goal_readiness_computed_at?: string | null
          goal_readiness_score?: number | null
          id?: string
          location_preference?: string | null
          professional_goal?: string | null
          professional_goal_set_at?: string | null
          professional_goal_structured?: Json | null
          target_companies?: string[]
          target_industries?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          career_goals?: string | null
          created_at?: string
          goal_readiness_components?: Json | null
          goal_readiness_computed_at?: string | null
          goal_readiness_score?: number | null
          id?: string
          location_preference?: string | null
          professional_goal?: string | null
          professional_goal_set_at?: string | null
          professional_goal_structured?: Json | null
          target_companies?: string[]
          target_industries?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      costing_account_classifications: {
        Row: {
          classified_at: string
          classified_by: string
          classification_reason: string
          costing_subject_id: string
          exclude_from_costing: boolean
          updated_at: string
        }
        Insert: Omit<
          Partial<Database["public"]["Tables"]["costing_account_classifications"]["Row"]>,
          "costing_subject_id"
        > & Pick<
          Database["public"]["Tables"]["costing_account_classifications"]["Row"],
          "costing_subject_id"
        >
        Update: Partial<Database["public"]["Tables"]["costing_account_classifications"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "costing_account_classifications_costing_subject_id_fkey"
            columns: ["costing_subject_id"]
            isOneToOne: true
            referencedRelation: "costing_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_monthly_aggregates: {
        Row: {
          active_subjects: number | null
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          canceled_runs: number | null
          completed_runs: number | null
          documents_parsed_without_ocr: number | null
          documents_processed: number | null
          failed_calls: number | null
          failed_incurred_cost_usd: number | null
          failed_runs: number | null
          feature: string | null
          file_type: string | null
          id: string
          input_tokens: number | null
          known_incurred_cost_usd: number | null
          merits_charged: number | null
          merits_refunded: number | null
          metric_scope: string
          model: string | null
          month: string
          ocr_documents: number | null
          ocr_failures: number | null
          ocr_retry_documents: number | null
          output_tokens: number | null
          retry_calls: number | null
          retry_incurred_cost_usd: number | null
          rolled_up_at: string
          started_runs: number | null
          subject_count_suppressed: boolean
          subscription_period_at_time: string | null
          successful_calls: number | null
          tier_at_time: string | null
          total_calls: number | null
          total_document_pages: number | null
          total_ocr_pages: number | null
          unknown_cost_attempts: number | null
          unknown_cost_documents: number | null
        }
        Insert: Omit<
          Partial<Database["public"]["Tables"]["costing_monthly_aggregates"]["Row"]>,
          "metric_scope" | "month"
        > & Pick<
          Database["public"]["Tables"]["costing_monthly_aggregates"]["Row"],
          "metric_scope" | "month"
        >
        Update: Partial<Database["public"]["Tables"]["costing_monthly_aggregates"]["Row"]>
        Relationships: []
      }
      costing_subjects: {
        Row: {
          auth_user_id: string | null
          created_at: string
          detached_at: string | null
          id: string
        }
        Insert: Partial<Database["public"]["Tables"]["costing_subjects"]["Row"]>
        Update: Partial<Database["public"]["Tables"]["costing_subjects"]["Row"]>
        Relationships: []
      }
      document_processing_runs: {
        Row: {
          ai_call_telemetry_id: number | null
          calculated_cost_usd: number | null
          completed_at: string | null
          cost_confidence: string
          cost_known: boolean
          cost_variance_usd: number | null
          costing_epoch: string
          costing_subject_id: string
          created_at: string
          document_ordinal: number
          environment: string
          error_category: string | null
          error_code: string | null
          exclude_from_costing_at_time: boolean
          extracted_character_count: number | null
          extraction_duration_ms: number | null
          extraction_status: string
          feature: string
          feature_run_id: string
          file_size_bytes: number | null
          file_type: string
          final_extractor: string | null
          id: string
          incurred_cost_usd: number | null
          initial_extractor: string
          ocr_attempt_count: number | null
          ocr_model: string | null
          ocr_pages: number | null
          ocr_provider: string | null
          ocr_status: string | null
          ocr_trigger_reason: string | null
          ocr_triggered: boolean
          page_count: number | null
          pricing_id: string | null
          provider_reported_cost_usd: number | null
          provider_request_id: string | null
          request_id: string | null
          started_at: string
          telemetry_version: string
          tier_at_time: string
          user_id: string | null
        }
        Insert: Omit<
          Partial<Database["public"]["Tables"]["document_processing_runs"]["Row"]>,
          "costing_subject_id" | "environment" | "extraction_status" | "feature" |
          "feature_run_id" | "file_type" | "initial_extractor" | "tier_at_time"
        > & Pick<
          Database["public"]["Tables"]["document_processing_runs"]["Row"],
          "costing_subject_id" | "environment" | "extraction_status" | "feature" |
          "feature_run_id" | "file_type" | "initial_extractor" | "tier_at_time"
        >
        Update: Partial<Database["public"]["Tables"]["document_processing_runs"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "document_processing_runs_ai_call_telemetry_id_fkey"
            columns: ["ai_call_telemetry_id"]
            isOneToOne: false
            referencedRelation: "ai_call_telemetry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_runs_costing_subject_id_fkey"
            columns: ["costing_subject_id"]
            isOneToOne: false
            referencedRelation: "costing_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_runs_feature_run_id_fkey"
            columns: ["feature_run_id"]
            isOneToOne: false
            referencedRelation: "feature_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_runs_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "provider_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_runs: {
        Row: {
          analysis_job_id: string | null
          cache_source: string | null
          completed_at: string | null
          costing_epoch: string
          costing_subject_id: string
          created_at: string
          document_count: number | null
          environment: string
          error_category: string | null
          error_code: string | null
          exclude_from_costing_at_time: boolean
          feature: string
          id: string
          input_type: string
          merit_charge_known: boolean
          merit_refund_known: boolean
          merits_charged: number | null
          merits_refunded: number | null
          request_id: string | null
          run_variant: string
          served_from_cache: boolean
          server_action_key_hash: string | null
          started_at: string
          status: string
          subscription_period_at_time: string | null
          telemetry_version: string
          tier_at_time: string
          updated_at: string
          user_id: string | null
        }
        Insert: Omit<
          Partial<Database["public"]["Tables"]["feature_runs"]["Row"]>,
          "costing_subject_id" | "environment" | "feature" | "tier_at_time"
        > & Pick<
          Database["public"]["Tables"]["feature_runs"]["Row"],
          "costing_subject_id" | "environment" | "feature" | "tier_at_time"
        >
        Update: Partial<Database["public"]["Tables"]["feature_runs"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "feature_runs_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_runs_costing_subject_id_fkey"
            columns: ["costing_subject_id"]
            isOneToOne: false
            referencedRelation: "costing_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_pricing: {
        Row: {
          api_variant: string | null
          billing_unit: string
          cache_read_per_million_usd: number | null
          cache_write_per_million_usd: number | null
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          exact_sku: string
          id: string
          input_per_million_usd: number | null
          output_per_million_usd: number | null
          pages_per_1000_usd: number | null
          provider: string
          region: string | null
          source_url: string
          source_version: string
        }
        Insert: Omit<
          Partial<Database["public"]["Tables"]["provider_pricing"]["Row"]>,
          "billing_unit" | "effective_from" | "exact_sku" | "provider" |
          "source_url" | "source_version"
        > & Pick<
          Database["public"]["Tables"]["provider_pricing"]["Row"],
          "billing_unit" | "effective_from" | "exact_sku" | "provider" |
          "source_url" | "source_version"
        >
        Update: Partial<Database["public"]["Tables"]["provider_pricing"]["Row"]>
        Relationships: []
      }

      feature_usage: {
        Row: {
          action: string
          feature: string
          id: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          action: string
          feature: string
          id?: string
          occurred_at?: string
          user_id: string
        }
        Update: {
          action?: string
          feature?: string
          id?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_taxonomy: {
        Row: {
          kind: string
          term: string
        }
        Insert: {
          kind: string
          term: string
        }
        Update: {
          kind?: string
          term?: string
        }
        Relationships: []
      }
      improvement_checklist: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          improvement_text: string
          resume_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          improvement_text: string
          resume_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          improvement_text?: string
          resume_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_checklist_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_quiz_answers: {
        Row: {
          archive_path: string | null
          competency: string | null
          created_at: string
          id: string
          question_order: number
          question_text: string
          quiz_id: string
          score: number | null
          scoring_breakdown: Json | null
          star_answer: Json | null
          suggestions: string[] | null
          user_answer: string | null
        }
        Insert: {
          archive_path?: string | null
          competency?: string | null
          created_at?: string
          id?: string
          question_order: number
          question_text: string
          quiz_id: string
          score?: number | null
          scoring_breakdown?: Json | null
          star_answer?: Json | null
          suggestions?: string[] | null
          user_answer?: string | null
        }
        Update: {
          archive_path?: string | null
          competency?: string | null
          created_at?: string
          id?: string
          question_order?: number
          question_text?: string
          quiz_id?: string
          score?: number | null
          scoring_breakdown?: Json | null
          star_answer?: Json | null
          suggestions?: string[] | null
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_quiz_answers_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "interview_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_quizzes: {
        Row: {
          archive_path: string | null
          background_context: string | null
          company: string | null
          created_at: string
          difficulty: string
          duration: number
          evaluated_at: string | null
          format: string
          id: string
          interview_type: string
          job_description: string
          job_title: string | null
          merit_transaction_id: string | null
          mode: string
          overall_score: number | null
          question_categories: string[]
          readiness_score: number | null
          resume_id: string | null
          role_title: string | null
          tier: string
          user_id: string
        }
        Insert: {
          archive_path?: string | null
          background_context?: string | null
          company?: string | null
          created_at?: string
          difficulty?: string
          duration?: number
          evaluated_at?: string | null
          format?: string
          id?: string
          interview_type?: string
          job_description: string
          job_title?: string | null
          merit_transaction_id?: string | null
          mode: string
          overall_score?: number | null
          question_categories?: string[]
          readiness_score?: number | null
          resume_id?: string | null
          role_title?: string | null
          tier: string
          user_id: string
        }
        Update: {
          archive_path?: string | null
          background_context?: string | null
          company?: string | null
          created_at?: string
          difficulty?: string
          duration?: number
          evaluated_at?: string | null
          format?: string
          id?: string
          interview_type?: string
          job_description?: string
          job_title?: string | null
          merit_transaction_id?: string | null
          mode?: string
          overall_score?: number | null
          question_categories?: string[]
          readiness_score?: number | null
          resume_id?: string | null
          role_title?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_quizzes_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_streaks: {
        Row: {
          current_streak: number
          last_quiz_at: string | null
          last_quiz_date: string | null
          longest_streak: number
          quizzes_today: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_quiz_at?: string | null
          last_quiz_date?: string | null
          longest_streak?: number
          quizzes_today?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_quiz_at?: string | null
          last_quiz_date?: string | null
          longest_streak?: number
          quizzes_today?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_descriptions: {
        Row: {
          captured_at: string
          id: string
          jd_url: string | null
          key_requirements: string[] | null
          match_score: number | null
          missing_skills_vs_user: string[] | null
          preferred_skills: string[] | null
          required_skills: string[] | null
          source_analysis_results_id: string | null
          user_id: string
        }
        Insert: {
          captured_at?: string
          id?: string
          jd_url?: string | null
          key_requirements?: string[] | null
          match_score?: number | null
          missing_skills_vs_user?: string[] | null
          preferred_skills?: string[] | null
          required_skills?: string[] | null
          source_analysis_results_id?: string | null
          user_id: string
        }
        Update: {
          captured_at?: string
          id?: string
          jd_url?: string | null
          key_requirements?: string[] | null
          match_score?: number | null
          missing_skills_vs_user?: string[] | null
          preferred_skills?: string[] | null
          required_skills?: string[] | null
          source_analysis_results_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_descriptions_source_analysis_results_id_fkey"
            columns: ["source_analysis_results_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_grades: {
        Row: {
          archive_path: string | null
          created_at: string | null
          email_sent_at: string | null
          grading_data: Json
          id: string
          overall_score: number
          profile_identifier: string
          profile_url: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          archive_path?: string | null
          created_at?: string | null
          email_sent_at?: string | null
          grading_data: Json
          id?: string
          overall_score: number
          profile_identifier: string
          profile_url: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          archive_path?: string | null
          created_at?: string | null
          email_sent_at?: string | null
          grading_data?: Json
          id?: string
          overall_score?: number
          profile_identifier?: string
          profile_url?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      linkedin_versions: {
        Row: {
          created_at: string
          id: string
          linkedin_grade_id: string | null
          overall_score: number | null
          parsed_summary: Json | null
          profile_identifier: string
          profile_url: string
          source_analysis_results_id: string | null
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linkedin_grade_id?: string | null
          overall_score?: number | null
          parsed_summary?: Json | null
          profile_identifier: string
          profile_url: string
          source_analysis_results_id?: string | null
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linkedin_grade_id?: string | null
          overall_score?: number | null
          parsed_summary?: Json | null
          profile_identifier?: string
          profile_url?: string
          source_analysis_results_id?: string | null
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_versions_linkedin_grade_id_fkey"
            columns: ["linkedin_grade_id"]
            isOneToOne: false
            referencedRelation: "linkedin_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_versions_source_analysis_results_id_fkey"
            columns: ["source_analysis_results_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "linkedin_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      merit_feature_costs: {
        Row: {
          cost: number
          feature: string
          tier: string
        }
        Insert: {
          cost: number
          feature: string
          tier: string
        }
        Update: {
          cost?: number
          feature?: string
          tier?: string
        }
        Relationships: []
      }
      merit_shop_purchases: {
        Row: {
          created_at: string
          id: string
          pack_size: number
          price_cents: number
          status: string
          stripe_payment_intent_id: string
          stripe_receipt_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pack_size: number
          price_cents: number
          status?: string
          stripe_payment_intent_id: string
          stripe_receipt_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pack_size?: number
          price_cents?: number
          status?: string
          stripe_payment_intent_id?: string
          stripe_receipt_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merit_shop_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "cohort_peers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merit_shop_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merit_transactions: {
        Row: {
          amount: number
          balance_type: string
          created_at: string
          feature: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          pack_id: string | null
          source: string
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_type: string
          created_at?: string
          feature?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          pack_id?: string | null
          source: string
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_type?: string
          created_at?: string
          feature?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          pack_id?: string | null
          source?: string
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "cohort_peers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          application_id: string
          final_outcome_date: string | null
          id: string
          interview_rounds: number | null
          offer_received: boolean | null
          outcome_confidence_score: number | null
          outcome_source: string
          rejection_stage: string | null
          reported_at: string
          result: string
        }
        Insert: {
          application_id: string
          final_outcome_date?: string | null
          id?: string
          interview_rounds?: number | null
          offer_received?: boolean | null
          outcome_confidence_score?: number | null
          outcome_source?: string
          rejection_stage?: string | null
          reported_at?: string
          result: string
        }
        Update: {
          application_id?: string
          final_outcome_date?: string | null
          id?: string
          interview_rounds?: number | null
          offer_received?: boolean | null
          outcome_confidence_score?: number | null
          outcome_source?: string
          rejection_stage?: string | null
          reported_at?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          archive_path: string | null
          avatar_url: string | null
          created_at: string
          credit_adjustment: number
          current_period_end: string | null
          email: string
          experience_level: string | null
          full_name: string | null
          graduation_year: number | null
          id: string
          job_type_preference: string | null
          linkedin_pdf_content: string | null
          linkedin_pdf_document_hash: string | null
          linkedin_pdf_extraction_metadata: Json | null
          linkedin_pdf_extraction_version: string | null
          linkedin_pdf_filename: string | null
          linkedin_pdf_text_hash: string | null
          linkedin_pdf_updated_at: string | null
          linkedin_url: string | null
          location_preference: string | null
          major: string | null
          pending_downgrade_tier: string | null
          preferred_locations: string[] | null
          school: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_tier: string
          updated_at: string
          year: string | null
        }
        Insert: {
          archive_path?: string | null
          avatar_url?: string | null
          created_at?: string
          credit_adjustment?: number
          current_period_end?: string | null
          email: string
          experience_level?: string | null
          full_name?: string | null
          graduation_year?: number | null
          id: string
          job_type_preference?: string | null
          linkedin_pdf_content?: string | null
          linkedin_pdf_document_hash?: string | null
          linkedin_pdf_extraction_metadata?: Json | null
          linkedin_pdf_extraction_version?: string | null
          linkedin_pdf_filename?: string | null
          linkedin_pdf_text_hash?: string | null
          linkedin_pdf_updated_at?: string | null
          linkedin_url?: string | null
          location_preference?: string | null
          major?: string | null
          pending_downgrade_tier?: string | null
          preferred_locations?: string[] | null
          school?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          updated_at?: string
          year?: string | null
        }
        Update: {
          archive_path?: string | null
          avatar_url?: string | null
          created_at?: string
          credit_adjustment?: number
          current_period_end?: string | null
          email?: string
          experience_level?: string | null
          full_name?: string | null
          graduation_year?: number | null
          id?: string
          job_type_preference?: string | null
          linkedin_pdf_content?: string | null
          linkedin_pdf_document_hash?: string | null
          linkedin_pdf_extraction_metadata?: Json | null
          linkedin_pdf_extraction_version?: string | null
          linkedin_pdf_filename?: string | null
          linkedin_pdf_text_hash?: string | null
          linkedin_pdf_updated_at?: string | null
          linkedin_url?: string | null
          location_preference?: string | null
          major?: string | null
          pending_downgrade_tier?: string | null
          preferred_locations?: string[] | null
          school?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          counter: number
          created_at: string
          rate_key: string
          window_start: number
        }
        Insert: {
          counter?: number
          created_at?: string
          rate_key: string
          window_start: number
        }
        Update: {
          counter?: number
          created_at?: string
          rate_key?: string
          window_start?: number
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          created_at: string
          feature: string
          id: string
          shown_at: string | null
          source_version_id: string | null
          suggestion_text: string
          suggestion_type: string
          target_ref_id: string | null
          target_ref_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          shown_at?: string | null
          source_version_id?: string | null
          suggestion_text: string
          suggestion_type: string
          target_ref_id?: string | null
          target_ref_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          shown_at?: string | null
          source_version_id?: string | null
          suggestion_text?: string
          suggestion_type?: string
          target_ref_id?: string | null
          target_ref_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      resume_bullets: {
        Row: {
          action_verb_quality: string | null
          bullet_score: number | null
          created_at: string
          id: string
          original_text: string
          position: number | null
          quantified_impact: boolean | null
          section_id: string
          suggested_improvement: string | null
          weakness_category: string | null
        }
        Insert: {
          action_verb_quality?: string | null
          bullet_score?: number | null
          created_at?: string
          id?: string
          original_text: string
          position?: number | null
          quantified_impact?: boolean | null
          section_id: string
          suggested_improvement?: string | null
          weakness_category?: string | null
        }
        Update: {
          action_verb_quality?: string | null
          bullet_score?: number | null
          created_at?: string
          id?: string
          original_text?: string
          position?: number | null
          quantified_impact?: boolean | null
          section_id?: string
          suggested_improvement?: string | null
          weakness_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_bullets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "resume_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_score_history: {
        Row: {
          id: string
          recorded_at: string
          resume_id: string | null
          score: number
          user_id: string
        }
        Insert: {
          id?: string
          recorded_at?: string
          resume_id?: string | null
          score: number
          user_id: string
        }
        Update: {
          id?: string
          recorded_at?: string
          resume_id?: string | null
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_score_history_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_sections: {
        Row: {
          created_at: string
          id: string
          position: number | null
          resume_version_id: string
          section_data: Json | null
          section_score: number | null
          section_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number | null
          resume_version_id: string
          section_data?: Json | null
          section_score?: number | null
          section_type: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number | null
          resume_version_id?: string
          section_data?: Json | null
          section_score?: number | null
          section_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_sections_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_versions: {
        Row: {
          created_at: string
          id: string
          overall_score: number | null
          parsed_summary: Json | null
          resume_id: string
          source_analysis_results_id: string | null
          supersedes_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          overall_score?: number | null
          parsed_summary?: Json | null
          resume_id: string
          source_analysis_results_id?: string | null
          supersedes_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overall_score?: number | null
          parsed_summary?: Json | null
          resume_id?: string
          source_analysis_results_id?: string | null
          supersedes_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_source_analysis_results_id_fkey"
            columns: ["source_analysis_results_id"]
            isOneToOne: false
            referencedRelation: "analysis_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          analyzed_at: string | null
          analyzed_tier: string | null
          archive_path: string | null
          created_at: string
          document_hash: string | null
          email_sent_at: string | null
          extracted_text: string | null
          extraction_metadata: Json | null
          extraction_version: string | null
          file_hash: string | null
          file_name: string
          file_path: string | null
          file_size: number
          file_url: string
          grading_data: Json | null
          id: string
          overall_score: number | null
          text_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analyzed_at?: string | null
          analyzed_tier?: string | null
          archive_path?: string | null
          created_at?: string
          document_hash?: string | null
          email_sent_at?: string | null
          extracted_text?: string | null
          extraction_metadata?: Json | null
          extraction_version?: string | null
          file_hash?: string | null
          file_name: string
          file_path?: string | null
          file_size: number
          file_url: string
          grading_data?: Json | null
          id?: string
          overall_score?: number | null
          text_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analyzed_at?: string | null
          analyzed_tier?: string | null
          archive_path?: string | null
          created_at?: string
          document_hash?: string | null
          email_sent_at?: string | null
          extracted_text?: string | null
          extraction_metadata?: Json | null
          extraction_version?: string | null
          file_hash?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number
          file_url?: string
          grading_data?: Json | null
          id?: string
          overall_score?: number | null
          text_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          cancelled_at: string | null
          created_at: string
          email_type: string
          id: string
          metadata: Json | null
          scheduled_for: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          email_type: string
          id?: string
          metadata?: Json | null
          scheduled_for: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          email_type?: string
          id?: string
          metadata?: Json | null
          scheduled_for?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          ats_score: number | null
          computed_at: string
          formatting_score: number | null
          id: string
          keyword_match_score: number | null
          overall_score: number | null
          quantified_impact_score: number | null
          recruiter_skim_score: number | null
          role_relevance_score: number | null
          version_id: string
          version_type: string
        }
        Insert: {
          ats_score?: number | null
          computed_at?: string
          formatting_score?: number | null
          id?: string
          keyword_match_score?: number | null
          overall_score?: number | null
          quantified_impact_score?: number | null
          recruiter_skim_score?: number | null
          role_relevance_score?: number | null
          version_id: string
          version_type: string
        }
        Update: {
          ats_score?: number | null
          computed_at?: string
          formatting_score?: number | null
          id?: string
          keyword_match_score?: number | null
          overall_score?: number | null
          quantified_impact_score?: number | null
          recruiter_skim_score?: number | null
          role_relevance_score?: number | null
          version_id?: string
          version_type?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          payload: Json
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          payload?: Json
        }
        Relationships: []
      }
      upgrade_requests: {
        Row: {
          created_at: string | null
          email: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          notes: string | null
          payment_method: string | null
          requested_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          requested_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          requested_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          action_type: Database["public"]["Enums"]["ai_action_type"]
          analysis_id: string | null
          billing_period_start: string
          created_at: string
          credits_consumed: number
          id: string
          user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["ai_action_type"]
          analysis_id?: string | null
          billing_period_start: string
          created_at?: string
          credits_consumed?: number
          id?: string
          user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["ai_action_type"]
          analysis_id?: string | null
          billing_period_start?: string
          created_at?: string
          credits_consumed?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_name: string
          achievement_type: string
          description: string | null
          earned_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          achievement_name: string
          achievement_type: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          achievement_name?: string
          achievement_type?: string
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_edits: {
        Row: {
          action: string
          edited_at: string
          final_user_text: string | null
          id: string
          original_text: string | null
          rec_id: string
          score_after: number | null
          score_before: number | null
          score_delta: number | null
          suggested_text: string | null
        }
        Insert: {
          action: string
          edited_at?: string
          final_user_text?: string | null
          id?: string
          original_text?: string | null
          rec_id: string
          score_after?: number | null
          score_before?: number | null
          score_delta?: number | null
          suggested_text?: string | null
        }
        Update: {
          action?: string
          edited_at?: string
          final_user_text?: string | null
          id?: string
          original_text?: string | null
          rec_id?: string
          score_after?: number | null
          score_before?: number | null
          score_delta?: number | null
          suggested_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_edits_rec_id_fkey"
            columns: ["rec_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_merits: {
        Row: {
          created_at: string
          id: string
          lifetime_granted: number
          shop_balance: number
          subscription_balance: number
          subscription_reset_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lifetime_granted?: number
          shop_balance?: number
          subscription_balance?: number
          subscription_reset_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lifetime_granted?: number
          shop_balance?: number
          subscription_balance?: number
          subscription_reset_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_merits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "cohort_peers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_merits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cohort_peers: {
        Row: {
          graduation_year: number | null
          location_preference: string | null
          major: string | null
          school: string | null
          target_companies: string[] | null
          target_industries: string[] | null
          target_roles: string[] | null
          user_id: string | null
          year: string | null
        }
        Relationships: []
      }
      costing_monthly_ai_current_rate_revaluation: {
        Row: {
          current_rate_revaluation_usd: number | null
          feature: string | null
          model: string | null
          month: string | null
          tier_at_time: string | null
          valuation_basis: string | null
        }
        Relationships: []
      }
      costing_monthly_ai_legacy_partial: {
        Row: {
          completeness: string | null
          feature: string | null
          input_tokens: number | null
          model: string | null
          month: string | null
          output_tokens: number | null
          tier: string | null
          total_calls: number | null
        }
        Relationships: []
      }
      costing_monthly_ai_usage: {
        Row: {
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          failed_calls: number | null
          failed_incurred_cost_usd: number | null
          feature: string | null
          input_tokens: number | null
          known_incurred_cost_usd: number | null
          model: string | null
          month: string | null
          output_tokens: number | null
          retry_calls: number | null
          retry_incurred_cost_usd: number | null
          successful_calls: number | null
          tier_at_time: string | null
          total_calls: number | null
          unknown_cost_attempts: number | null
        }
        Relationships: []
      }
      costing_monthly_document_usage: {
        Row: {
          average_ocr_pages: number | null
          documents_parsed_without_ocr: number | null
          documents_processed: number | null
          feature: string | null
          file_type: string | null
          known_incurred_cost_usd: number | null
          month: string | null
          ocr_documents: number | null
          ocr_failures: number | null
          ocr_incidence: number | null
          ocr_retry_documents: number | null
          tier_at_time: string | null
          total_document_pages: number | null
          total_ocr_pages: number | null
          unknown_cost_documents: number | null
        }
        Relationships: []
      }
      costing_monthly_feature_usage: {
        Row: {
          canceled_runs: number | null
          completed_runs: number | null
          failed_runs: number | null
          feature: string | null
          merits_charged: number | null
          merits_refunded: number | null
          month: string | null
          started_runs: number | null
          subject_count_suppressed: boolean | null
          subscription_period_at_time: string | null
          tier_at_time: string | null
          unique_users: number | null
        }
        Relationships: []
      }
      costing_monthly_product_mau: {
        Row: {
          active_users: number | null
          metric_definition: string | null
          month: string | null
          subject_count_suppressed: boolean | null
          subscription_period_at_time: string | null
          tier_at_time: string | null
        }
        Relationships: []
      }

      v_conversion_funnel: {
        Row: {
          day: string | null
          depleted_users: number | null
          purchasers: number | null
          shop_viewers: number | null
        }
        Relationships: []
      }
      v_feature_consumption_daily: {
        Row: {
          day: string | null
          deductions: number | null
          feature: string | null
          impulses_spent: number | null
          refunds: number | null
        }
        Relationships: []
      }
      v_merits_in_circulation: {
        Row: {
          net_impulses_30d: number | null
          tier: string | null
          user_count: number | null
        }
        Relationships: []
      }
      v_shop_purchases_daily: {
        Row: {
          day: string | null
          purchase_count: number | null
          status: string | null
          total_impulses_granted: number | null
          total_price_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_set_user_credits: {
        Args: { p_credits: number; p_user_id: string }
        Returns: number
      }
      admin_set_user_merits: {
        Args: { p_merits: number; p_user_id: string }
        Returns: number
      }
      admin_upgrade_user: {
        Args: { p_request_id?: string; p_tier?: string; p_user_id: string }
        Returns: Json
      }
      auth_owns_version: {
        Args: { p_version_id: string; p_version_type: string }
        Returns: boolean
      }
      can_perform_ai_action: { Args: { p_user_id: string }; Returns: Json }
      check_and_deduct_merits: {
        Args: {
          p_feature: string
          p_idempotency_key?: string
          p_tier: string
          p_user_id: string
        }
        Returns: Json
      }
      check_and_record_ai_usage: {
        Args: {
          p_action_type: Database["public"]["Enums"]["ai_action_type"]
          p_credits?: number
          p_user_id: string
        }
        Returns: Json
      }
      create_or_recover_analysis_run: {
        Args: {
          p_feature: string
          p_idempotency_key: string
          p_job_type: string
          p_payload?: Json
          p_resume_id?: string
          p_tier: string
          p_user_id: string
        }
        Returns: Json
      }
      rollup_and_prune_costing_telemetry: { Args: never; Returns: Json }
      persist_resume_elite_unlock: {
        Args: {
          p_base_analysis_id: string
          p_expected_base_fingerprint: string
          p_expected_base_grading_data: Json
          p_expected_document_hash: string
          p_expected_file_hash: string
          p_expected_text_hash: string
          p_generated_sections: string[]
          p_idempotency_key: string
          p_merged_grading_data: Json
          p_owner_id: string
          p_resume_id: string
          p_run_id: string
          p_usage_credits: number
        }
        Returns: Json
      }
      credit_shop_merits: {
        Args: {
          p_pack_size: number
          p_stripe_payment_id: string
          p_user_id: string
        }
        Returns: Json
      }
      get_admin_usage_stats: {
        Args: never
        Returns: {
          email: string
          last_action_at: string
          shop_balance: number
          subscription_balance: number
          subscription_tier: string
          total_actions: number
          total_merits: number
          user_id: string
        }[]
      }
      get_ai_failure_rate_1h: { Args: never; Returns: number }
      get_billing_period_start: { Args: { p_user_id: string }; Returns: string }
      get_merit_balance: { Args: { p_user_id: string }; Returns: Json }
      get_pending_upgrade_requests: {
        Args: never
        Returns: {
          email: string
          id: string
          notes: string
          payment_method: string
          requested_at: string
          status: string
          user_id: string
        }[]
      }
      get_shop_failure_rate_1h: { Args: never; Returns: number }
      get_usage_limit: {
        Args: { p_subscription_tier: string }
        Returns: number
      }
      get_user_usage: { Args: { p_user_id: string }; Returns: number }
      get_user_usage_breakdown: {
        Args: { p_user_id: string }
        Returns: {
          action_type: string
          credits_used: number
        }[]
      }
      grant_upgrade_diff: {
        Args: { p_from_tier: string; p_to_tier: string; p_user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_rate_limit: {
        Args: { p_key: string; p_window_start: number }
        Returns: number
      }
      reconcile_merit_balance: {
        Args: { p_user_id: string }
        Returns: {
          balance_sum: number
          drift: number
          transactions_sum: number
          user_id: string
        }[]
      }
      record_ai_usage:
        | {
            Args: {
              p_action_type: Database["public"]["Enums"]["ai_action_type"]
              p_credits?: number
              p_user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_action_type: Database["public"]["Enums"]["ai_action_type"]
              p_analysis_id?: string
              p_credits?: number
              p_user_id: string
            }
            Returns: boolean
          }
      record_feature_usage: {
        Args: { p_action: string; p_feature: string }
        Returns: string
      }
      record_recommendations_shown: {
        Args: { rec_ids: string[] }
        Returns: number
      }
      refund_merits: {
        Args: { p_transaction_id: string; p_user_id: string }
        Returns: Json
      }
      reset_subscription_merits: {
        Args: { p_next_reset_date: string; p_tier: string; p_user_id: string }
        Returns: Json
      }
      run_benchmarks_rollup: { Args: never; Returns: Json }
      run_lifecycle_sweep: { Args: never; Returns: Json }
      transition_analysis_run: {
        Args: {
          p_from_state: string
          p_patch?: Json
          p_run_id: string
          p_to_state: string
        }
        Returns: Json
      }
      ts_to_utc_date: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      ai_action_type:
        | "resume_analysis"
        | "job_matching"
        | "career_compass"
        | "skills_gap_analysis"
        | "linkedin_grading"
        | "job_comparison"
        | "recruiting_lens"
        | "interview_prep"
      app_role: "admin" | "moderator" | "user"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_action_type: [
        "resume_analysis",
        "job_matching",
        "career_compass",
        "skills_gap_analysis",
        "linkedin_grading",
        "job_comparison",
        "recruiting_lens",
        "interview_prep",
      ],
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
