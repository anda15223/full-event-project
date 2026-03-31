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
      invoices: {
        Row: {
          amount: number | null
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
      [_ in never]: never
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
