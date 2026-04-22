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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      brain_entries: {
        Row: {
          category: string | null
          confidence: number
          content: string
          created_at: string
          display_name: string | null
          festival_id: string | null
          frequency: number
          id: string
          is_active: boolean | null
          key_name: string
          last_seen_at: string
          last_seen_festival_id: string | null
          scope: string
          source: string | null
          structured_data: Json | null
          subject_id: string | null
          subject_type: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          confidence?: number
          content: string
          created_at?: string
          display_name?: string | null
          festival_id?: string | null
          frequency?: number
          id?: string
          is_active?: boolean | null
          key_name: string
          last_seen_at?: string
          last_seen_festival_id?: string | null
          scope?: string
          source?: string | null
          structured_data?: Json | null
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          confidence?: number
          content?: string
          created_at?: string
          display_name?: string | null
          festival_id?: string | null
          frequency?: number
          id?: string
          is_active?: boolean | null
          key_name?: string
          last_seen_at?: string
          last_seen_festival_id?: string | null
          scope?: string
          source?: string | null
          structured_data?: Json | null
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_entries: {
        Row: {
          amount: number | null
          bc_catering_branch: string | null
          company: string | null
          created_at: string
          currency: string | null
          description: string | null
          direction: string
          email_id: string | null
          entry_date: string | null
          entry_type: string
          id: string
          location: string | null
          reference: string | null
          relates_to_invoice_id: string | null
          source_email_sender: string | null
          status: string | null
          supplier_name: string | null
        }
        Insert: {
          amount?: number | null
          bc_catering_branch?: string | null
          company?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          direction?: string
          email_id?: string | null
          entry_date?: string | null
          entry_type?: string
          id?: string
          location?: string | null
          reference?: string | null
          relates_to_invoice_id?: string | null
          source_email_sender?: string | null
          status?: string | null
          supplier_name?: string | null
        }
        Update: {
          amount?: number | null
          bc_catering_branch?: string | null
          company?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          direction?: string
          email_id?: string | null
          entry_date?: string | null
          entry_type?: string
          id?: string
          location?: string | null
          reference?: string | null
          relates_to_invoice_id?: string | null
          source_email_sender?: string | null
          status?: string | null
          supplier_name?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          country_group: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          country_group?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          country_group?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          cid: string | null
          content_disposition: string | null
          created_at: string
          document_type: string | null
          email_id: string
          extracted_summary: string | null
          extracted_text: string | null
          filename: string | null
          id: string
          is_inline: boolean | null
          mime_type: string | null
          parse_error: string | null
          parse_status: string | null
          part_number: string | null
          size: number | null
          storage_path: string | null
        }
        Insert: {
          cid?: string | null
          content_disposition?: string | null
          created_at?: string
          document_type?: string | null
          email_id: string
          extracted_summary?: string | null
          extracted_text?: string | null
          filename?: string | null
          id?: string
          is_inline?: boolean | null
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string | null
          part_number?: string | null
          size?: number | null
          storage_path?: string | null
        }
        Update: {
          cid?: string | null
          content_disposition?: string | null
          created_at?: string
          document_type?: string | null
          email_id?: string
          extracted_summary?: string | null
          extracted_text?: string | null
          filename?: string | null
          id?: string
          is_inline?: boolean | null
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string | null
          part_number?: string | null
          size?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_invoices: {
        Row: {
          amount: number | null
          attachment_present: boolean | null
          company: string | null
          created_at: string
          currency: string | null
          due_date: string | null
          email_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          supplier_name: string | null
          vat: number | null
        }
        Insert: {
          amount?: number | null
          attachment_present?: boolean | null
          company?: string | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          supplier_name?: string | null
          vat?: number | null
        }
        Update: {
          amount?: number | null
          attachment_present?: boolean | null
          company?: string | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          supplier_name?: string | null
          vat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_invoices_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_batch: number | null
          current_subject: string | null
          error_log: Json | null
          id: string
          last_uid_processed: string | null
          started_at: string | null
          status: string
          sync_from: string | null
          sync_to: string | null
          total_batches: number | null
          total_emails_found: number | null
          total_invoices_extracted: number | null
          total_processed: number | null
          total_skipped: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number | null
          current_subject?: string | null
          error_log?: Json | null
          id?: string
          last_uid_processed?: string | null
          started_at?: string | null
          status?: string
          sync_from?: string | null
          sync_to?: string | null
          total_batches?: number | null
          total_emails_found?: number | null
          total_invoices_extracted?: number | null
          total_processed?: number | null
          total_skipped?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_batch?: number | null
          current_subject?: string | null
          error_log?: Json | null
          id?: string
          last_uid_processed?: string | null
          started_at?: string | null
          status?: string
          sync_from?: string | null
          sync_to?: string | null
          total_batches?: number | null
          total_emails_found?: number | null
          total_invoices_extracted?: number | null
          total_processed?: number | null
          total_skipped?: number | null
        }
        Relationships: []
      }
      email_tasks: {
        Row: {
          company: string | null
          created_at: string
          due_date: string | null
          email_id: string | null
          id: string
          notes: string | null
          owner: string | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          due_date?: string | null
          email_id?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          due_date?: string | null
          email_id?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_tasks_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          action_required: boolean | null
          assigned_agent: string | null
          body_clean_text: string | null
          body_html: string | null
          body_text: string | null
          charset: string | null
          classification: string | null
          company: string | null
          confidence: number | null
          created_at: string
          has_attachments: boolean | null
          id: string
          language: string | null
          message_id: string | null
          model_used: string | null
          needs_review: boolean | null
          parse_error: string | null
          parse_status: string | null
          processed: boolean | null
          reader_status: string | null
          received_at: string | null
          review_reason: string | null
          router_status: string | null
          sender: string | null
          subject: string | null
          summary: string | null
        }
        Insert: {
          action_required?: boolean | null
          assigned_agent?: string | null
          body_clean_text?: string | null
          body_html?: string | null
          body_text?: string | null
          charset?: string | null
          classification?: string | null
          company?: string | null
          confidence?: number | null
          created_at?: string
          has_attachments?: boolean | null
          id?: string
          language?: string | null
          message_id?: string | null
          model_used?: string | null
          needs_review?: boolean | null
          parse_error?: string | null
          parse_status?: string | null
          processed?: boolean | null
          reader_status?: string | null
          received_at?: string | null
          review_reason?: string | null
          router_status?: string | null
          sender?: string | null
          subject?: string | null
          summary?: string | null
        }
        Update: {
          action_required?: boolean | null
          assigned_agent?: string | null
          body_clean_text?: string | null
          body_html?: string | null
          body_text?: string | null
          charset?: string | null
          classification?: string | null
          company?: string | null
          confidence?: number | null
          created_at?: string
          has_attachments?: boolean | null
          id?: string
          language?: string | null
          message_id?: string | null
          model_used?: string | null
          needs_review?: boolean | null
          parse_error?: string | null
          parse_status?: string | null
          processed?: boolean | null
          reader_status?: string | null
          received_at?: string | null
          review_reason?: string | null
          router_status?: string | null
          sender?: string | null
          subject?: string | null
          summary?: string | null
        }
        Relationships: []
      }
      festival_accommodation: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          festival_id: string
          id: string
          label: string
          notes: string | null
          people_count: number | null
          room_config: string | null
          status: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          festival_id: string
          id?: string
          label: string
          notes?: string | null
          people_count?: number | null
          room_config?: string | null
          status: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          festival_id?: string
          id?: string
          label?: string
          notes?: string | null
          people_count?: number | null
          room_config?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_action_items: {
        Row: {
          created_at: string
          deadline: string | null
          festival_id: string
          id: string
          notes: string | null
          owner: string | null
          priority: string
          section_key: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string
          section_key?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string
          section_key?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_answers: {
        Row: {
          festival_id: string
          id: string
          question_id: string
          updated_at: string
          value: Json
          value_type: string
        }
        Insert: {
          festival_id: string
          id?: string
          question_id: string
          updated_at?: string
          value: Json
          value_type: string
        }
        Update: {
          festival_id?: string
          id?: string
          question_id?: string
          updated_at?: string
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_answers_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "festival_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_bc_trolley_items: {
        Row: {
          category: string
          created_at: string
          id: string
          item_name: string
          order_index: number
          quantity: string | null
          trolley_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          item_name: string
          order_index: number
          quantity?: string | null
          trolley_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          item_name?: string
          order_index?: number
          quantity?: string | null
          trolley_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_bc_trolley_items_trolley_id_fkey"
            columns: ["trolley_id"]
            isOneToOne: false
            referencedRelation: "festival_bc_trolleys"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_bc_trolleys: {
        Row: {
          concept_id: string
          created_at: string
          id: string
          label: string
          trolley_number: number
        }
        Insert: {
          concept_id: string
          created_at?: string
          id?: string
          label: string
          trolley_number: number
        }
        Update: {
          concept_id?: string
          created_at?: string
          id?: string
          label?: string
          trolley_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "festival_bc_trolleys_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "festival_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_concepts: {
        Row: {
          created_at: string
          details: Json
          festival_id: string
          gas_required: boolean
          gas_supplier: string | null
          id: string
          name: string
          order_index: number
          photos: Json
          power_baseline: string | null
          power_extras: Json | null
          products_sold: string | null
          sales_hours_fri: string | null
          sales_hours_sat: string | null
          sales_hours_sun: string | null
          sales_hours_thu: string | null
          subsections: Json
          tent_size: string | null
          updated_at: string
          wristband_black_partout: number | null
          wristband_max: number | null
          wristband_normal_partout: number | null
          zone: string
        }
        Insert: {
          created_at?: string
          details?: Json
          festival_id: string
          gas_required?: boolean
          gas_supplier?: string | null
          id?: string
          name: string
          order_index: number
          photos?: Json
          power_baseline?: string | null
          power_extras?: Json | null
          products_sold?: string | null
          sales_hours_fri?: string | null
          sales_hours_sat?: string | null
          sales_hours_sun?: string | null
          sales_hours_thu?: string | null
          subsections?: Json
          tent_size?: string | null
          updated_at?: string
          wristband_black_partout?: number | null
          wristband_max?: number | null
          wristband_normal_partout?: number | null
          zone: string
        }
        Update: {
          created_at?: string
          details?: Json
          festival_id?: string
          gas_required?: boolean
          gas_supplier?: string | null
          id?: string
          name?: string
          order_index?: number
          photos?: Json
          power_baseline?: string | null
          power_extras?: Json | null
          products_sold?: string | null
          sales_hours_fri?: string | null
          sales_hours_sat?: string | null
          sales_hours_sun?: string | null
          sales_hours_thu?: string | null
          subsections?: Json
          tent_size?: string | null
          updated_at?: string
          wristband_black_partout?: number | null
          wristband_max?: number | null
          wristband_normal_partout?: number | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_contacts: {
        Row: {
          created_at: string
          email: string | null
          festival_id: string
          id: string
          name: string
          notes: string | null
          order_index: number
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          festival_id: string
          id?: string
          name: string
          notes?: string | null
          order_index?: number
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          festival_id?: string
          id?: string
          name?: string
          notes?: string | null
          order_index?: number
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      festival_extra_details: {
        Row: {
          created_at: string
          festival_id: string
          id: string
          label: string
          notes: string | null
          order_index: number
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          festival_id: string
          id?: string
          label?: string
          notes?: string | null
          order_index?: number
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          festival_id?: string
          id?: string
          label?: string
          notes?: string | null
          order_index?: number
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      festival_questions: {
        Row: {
          created_at: string
          default_value: Json | null
          help_text: string | null
          id: string
          key: string
          kind: string
          options: Json | null
          order_index: number
          prompt: string
          required: boolean
          section_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: Json | null
          help_text?: string | null
          id?: string
          key: string
          kind: string
          options?: Json | null
          order_index: number
          prompt: string
          required?: boolean
          section_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: Json | null
          help_text?: string | null
          id?: string
          key?: string
          kind?: string
          options?: Json | null
          order_index?: number
          prompt?: string
          required?: boolean
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "festival_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_reports: {
        Row: {
          festival_id: string
          generated_at: string
          id: string
          schema_snapshot: Json
          storage_key: string | null
          version: number
        }
        Insert: {
          festival_id: string
          generated_at?: string
          id?: string
          schema_snapshot: Json
          storage_key?: string | null
          version: number
        }
        Update: {
          festival_id?: string
          generated_at?: string
          id?: string
          schema_snapshot?: Json
          storage_key?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_sections: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          order_index: number
          sub_editor_route: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          order_index: number
          sub_editor_route?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          order_index?: number
          sub_editor_route?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      festival_staff: {
        Row: {
          concept_id: string | null
          created_at: string
          external_key: string | null
          festival_id: string
          id: string
          is_manager: boolean
          is_setup_crew: boolean
          name: string | null
          role: string | null
          source: string
          wristband_type: string | null
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          external_key?: string | null
          festival_id: string
          id?: string
          is_manager?: boolean
          is_setup_crew?: boolean
          name?: string | null
          role?: string | null
          source: string
          wristband_type?: string | null
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          external_key?: string | null
          festival_id?: string
          id?: string
          is_manager?: boolean
          is_setup_crew?: boolean
          name?: string | null
          role?: string | null
          source?: string
          wristband_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_staff_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "festival_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_vagtplan_shifts: {
        Row: {
          concept_id: string
          created_at: string
          day: string
          end_time: string
          id: string
          notes: string | null
          order_index: number
          people_count: number
          shift_name: string
          start_time: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          day: string
          end_time: string
          id?: string
          notes?: string | null
          order_index: number
          people_count: number
          shift_name: string
          start_time: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          day?: string
          end_time?: string
          id?: string
          notes?: string | null
          order_index?: number
          people_count?: number
          shift_name?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_vagtplan_shifts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "festival_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_vehicles: {
        Row: {
          created_at: string
          driver: string | null
          festival_id: string
          id: string
          label: string
          purpose: string | null
          seats: number | null
          status: string
          travel_date: string | null
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          driver?: string | null
          festival_id: string
          id?: string
          label: string
          purpose?: string | null
          seats?: number | null
          status: string
          travel_date?: string | null
          vehicle_type: string
        }
        Update: {
          created_at?: string
          driver?: string | null
          festival_id?: string
          id?: string
          label?: string
          purpose?: string | null
          seats?: number | null
          status?: string
          travel_date?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
      festivals: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          end_date: string
          id: string
          location: string | null
          name: string
          organiser_email: string | null
          organiser_name: string | null
          organiser_phone: string | null
          slug: string
          start_date: string
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          end_date: string
          id?: string
          location?: string | null
          name: string
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          slug: string
          start_date: string
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          end_date?: string
          id?: string
          location?: string | null
          name?: string
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          slug?: string
          start_date?: string
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number | null
          category: string | null
          company: string | null
          confidence: number | null
          created_at: string
          currency: string | null
          due_date: string | null
          email_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          location: string | null
          notes: string | null
          overdue_flag: boolean | null
          payment_account: string | null
          payment_reference: string | null
          pdf_url: string | null
          source_type: string | null
          status: string | null
          supplier_name: string | null
          total_with_vat: number | null
          vat_amount: number | null
          what_was_bought: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          company?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          location?: string | null
          notes?: string | null
          overdue_flag?: boolean | null
          payment_account?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          source_type?: string | null
          status?: string | null
          supplier_name?: string | null
          total_with_vat?: number | null
          vat_amount?: number | null
          what_was_bought?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          company?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          due_date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          location?: string | null
          notes?: string | null
          overdue_flag?: boolean | null
          payment_account?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          source_type?: string | null
          status?: string | null
          supplier_name?: string | null
          total_with_vat?: number | null
          vat_amount?: number | null
          what_was_bought?: string | null
        }
        Relationships: []
      }
      kpi_ledger: {
        Row: {
          company: string | null
          confidence: number | null
          created_at: string
          currency: string | null
          date: string | null
          email_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          location: string | null
          notes: string | null
          period_from: string | null
          period_to: string | null
          platform: string
          source_type: string | null
          total_amount: number | null
          verified: boolean | null
        }
        Insert: {
          company?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          location?: string | null
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          platform: string
          source_type?: string | null
          total_amount?: number | null
          verified?: boolean | null
        }
        Update: {
          company?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          date?: string | null
          email_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          location?: string | null
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          platform?: string
          source_type?: string | null
          total_amount?: number | null
          verified?: boolean | null
        }
        Relationships: []
      }
      ledger: {
        Row: {
          amount: number | null
          company: string | null
          created_at: string
          id: string
          invoice_id: string | null
          invoice_number: string | null
          location: string | null
          paid_date: string | null
          payment_reference: string | null
          supplier_name: string | null
          total_with_vat: number | null
          vat_amount: number | null
          what_was_bought: string | null
        }
        Insert: {
          amount?: number | null
          company?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          location?: string | null
          paid_date?: string | null
          payment_reference?: string | null
          supplier_name?: string | null
          total_with_vat?: number | null
          vat_amount?: number | null
          what_was_bought?: string | null
        }
        Update: {
          amount?: number | null
          company?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          location?: string | null
          paid_date?: string | null
          payment_reference?: string | null
          supplier_name?: string | null
          total_with_vat?: number | null
          vat_amount?: number | null
          what_was_bought?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_cards: {
        Row: {
          card_key: string
          concept_id: string | null
          created_at: string
          festival_id: string
          id: string
          meta: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          card_key: string
          concept_id?: string | null
          created_at?: string
          festival_id: string
          id?: string
          meta?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          card_key?: string
          concept_id?: string | null
          created_at?: string
          festival_id?: string
          id?: string
          meta?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      smart_files: {
        Row: {
          ai_summary: string | null
          card_id: string
          extracted_text: string | null
          filename: string | null
          id: string
          mime_type: string | null
          parse_error: string | null
          parse_status: string
          size: number | null
          storage_path: string
          uploaded_at: string
          url: string | null
        }
        Insert: {
          ai_summary?: string | null
          card_id: string
          extracted_text?: string | null
          filename?: string | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          size?: number | null
          storage_path: string
          uploaded_at?: string
          url?: string | null
        }
        Update: {
          ai_summary?: string | null
          card_id?: string
          extracted_text?: string | null
          filename?: string | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          size?: number | null
          storage_path?: string
          uploaded_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_files_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "smart_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_lines: {
        Row: {
          ai_confidence: number | null
          created_at: string
          due_date: string | null
          id: string
          label: string | null
          meta: Json
          notes: string | null
          order_index: number
          owner: string | null
          quantity: string | null
          section_id: string
          source: string
          source_file_id: string | null
          status: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string | null
          meta?: Json
          notes?: string | null
          order_index?: number
          owner?: string | null
          quantity?: string | null
          section_id: string
          source?: string
          source_file_id?: string | null
          status?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string | null
          meta?: Json
          notes?: string | null
          order_index?: number
          owner?: string | null
          quantity?: string | null
          section_id?: string
          source?: string
          source_file_id?: string | null
          status?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_lines_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "smart_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_sections: {
        Row: {
          card_id: string
          created_at: string
          description: string | null
          id: string
          meta: Json
          order_index: number
          source: string
          source_file_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          card_id: string
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json
          order_index?: number
          source?: string
          source_file_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json
          order_index?: number
          source?: string
          source_file_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_sections_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "smart_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_corrections: {
        Row: {
          created_at: string
          field_corrected: string | null
          id: string
          invoice_id: string | null
          new_value: string | null
          old_value: string | null
          supplier_name: string | null
        }
        Insert: {
          created_at?: string
          field_corrected?: string | null
          id?: string
          invoice_id?: string | null
          new_value?: string | null
          old_value?: string | null
          supplier_name?: string | null
        }
        Update: {
          created_at?: string
          field_corrected?: string | null
          id?: string
          invoice_id?: string | null
          new_value?: string | null
          old_value?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_corrections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          correction_count: number | null
          created_at: string
          email_domain: string | null
          id: string
          is_web_order_supplier: boolean | null
          known_companies: string[] | null
          known_locations: string[] | null
          name: string
          notes: string | null
          payment_account: string | null
          payment_terms: string | null
          reconcile_with: string | null
          vat_included: boolean | null
        }
        Insert: {
          correction_count?: number | null
          created_at?: string
          email_domain?: string | null
          id?: string
          is_web_order_supplier?: boolean | null
          known_companies?: string[] | null
          known_locations?: string[] | null
          name: string
          notes?: string | null
          payment_account?: string | null
          payment_terms?: string | null
          reconcile_with?: string | null
          vat_included?: boolean | null
        }
        Update: {
          correction_count?: number | null
          created_at?: string
          email_domain?: string | null
          id?: string
          is_web_order_supplier?: boolean | null
          known_companies?: string[] | null
          known_locations?: string[] | null
          name?: string
          notes?: string | null
          payment_account?: string | null
          payment_terms?: string | null
          reconcile_with?: string | null
          vat_included?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recalculate_invoice_statuses: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
