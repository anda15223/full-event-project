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
      concept_equipment_template: {
        Row: {
          concept_id: string
          created_at: string | null
          equipment_name: string
          id: string
          is_shared_with_other_concept: boolean | null
          notes: string | null
          position: number
          power_kw: number | null
          power_type: string
          quantity: number
          shared_with_concept_slug: string | null
          updated_at: string | null
          variant: string
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          equipment_name: string
          id?: string
          is_shared_with_other_concept?: boolean | null
          notes?: string | null
          position?: number
          power_kw?: number | null
          power_type: string
          quantity?: number
          shared_with_concept_slug?: string | null
          updated_at?: string | null
          variant?: string
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          equipment_name?: string
          id?: string
          is_shared_with_other_concept?: boolean | null
          notes?: string | null
          position?: number
          power_kw?: number | null
          power_type?: string
          quantity?: number
          shared_with_concept_slug?: string | null
          updated_at?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_equipment_template_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_equipment_template_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      concept_trolley_items: {
        Row: {
          concept_id: string
          created_at: string
          id: string
          item_name: string
          notes: string | null
          position: number
          quantity: string
          updated_at: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          position?: number
          quantity: string
          updated_at?: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          position?: number
          quantity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_trolley_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_trolley_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      concepts: {
        Row: {
          color_hex: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          operational_name: string | null
          short_name: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          operational_name?: string | null
          short_name?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          operational_name?: string | null
          short_name?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cross_festival_rules: {
        Row: {
          active: boolean | null
          applies_to_festivals: string[] | null
          applies_to_operators: string[] | null
          category: string | null
          created_at: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          linked_question_id: string | null
          rule_description: string
          rule_name: string
          severity: string | null
          source: string | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          active?: boolean | null
          applies_to_festivals?: string[] | null
          applies_to_operators?: string[] | null
          category?: string | null
          created_at?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          linked_question_id?: string | null
          rule_description: string
          rule_name: string
          severity?: string | null
          source?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          active?: boolean | null
          applies_to_festivals?: string[] | null
          applies_to_operators?: string[] | null
          category?: string | null
          created_at?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          linked_question_id?: string | null
          rule_description?: string
          rule_name?: string
          severity?: string | null
          source?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: []
      }
      dish_prices: {
        Row: {
          created_at: string | null
          dish_id: string
          festival_id: string
          id: string
          notes: string | null
          price_dkk: number
          price_includes_vat: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dish_id: string
          festival_id: string
          id?: string
          notes?: string | null
          price_dkk: number
          price_includes_vat?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dish_id?: string
          festival_id?: string
          id?: string
          notes?: string | null
          price_dkk?: number
          price_includes_vat?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_prices_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "dish_prices_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      dishes: {
        Row: {
          concept_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sale_price_dkk: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sale_price_dkk?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sale_price_dkk?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dishes_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishes_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
        ]
      }
      equipment_catalog: {
        Row: {
          category: string | null
          created_at: string | null
          default_supplier_id: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          ownership: string | null
          power_amps: number | null
          power_type: string | null
          rental_cost_per_festival: number | null
          rental_supplier_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          ownership?: string | null
          power_amps?: number | null
          power_type?: string | null
          rental_cost_per_festival?: number | null
          rental_supplier_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          ownership?: string | null
          power_amps?: number | null
          power_type?: string | null
          rental_cost_per_festival?: number | null
          rental_supplier_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_catalog_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_catalog_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_catalog_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "equipment_catalog_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_accommodation: {
        Row: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"]
          address: string | null
          amenities: string[] | null
          assigned_staff: string[] | null
          assigned_staff_count: number | null
          booking_file_path: string | null
          booking_made_by: string | null
          capacity: number | null
          check_in_date: string | null
          check_in_time: string | null
          check_out_date: string | null
          check_out_time: string | null
          confirmation_number: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          cost_dkk: number | null
          created_at: string
          festival_id: string
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["accommodation_payment_status"]
          provider_name: string | null
          updated_at: string
        }
        Insert: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"]
          address?: string | null
          amenities?: string[] | null
          assigned_staff?: string[] | null
          assigned_staff_count?: number | null
          booking_file_path?: string | null
          booking_made_by?: string | null
          capacity?: number | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          confirmation_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cost_dkk?: number | null
          created_at?: string
          festival_id: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["accommodation_payment_status"]
          provider_name?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"]
          address?: string | null
          amenities?: string[] | null
          assigned_staff?: string[] | null
          assigned_staff_count?: number | null
          booking_file_path?: string | null
          booking_made_by?: string | null
          capacity?: number | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          confirmation_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cost_dkk?: number | null
          created_at?: string
          festival_id?: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["accommodation_payment_status"]
          provider_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      festival_accommodation_assignments: {
        Row: {
          accommodation_id: string
          check_in: string | null
          check_out: string | null
          created_at: string | null
          id: string
          nights: number | null
          notes: string | null
          staff_id: string
        }
        Insert: {
          accommodation_id: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          id?: string
          nights?: number | null
          notes?: string | null
          staff_id: string
        }
        Update: {
          accommodation_id?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          id?: string
          nights?: number | null
          notes?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_accommodation_assignments_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "festival_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_accommodation_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_accommodation_legacy: {
        Row: {
          actual_cost_dkk: number | null
          bed_count: number | null
          bed_nights: number | null
          booking_reference: string | null
          check_in_date: string | null
          check_out_date: string | null
          created_at: string | null
          estimated_cost_dkk: number | null
          festival_id: string
          group_label: string | null
          id: string
          nights: number | null
          notes: string | null
          person_count: number | null
          room_count: number | null
          status: string | null
          updated_at: string | null
          venue_address: string | null
          venue_name: string
          venue_url: string | null
        }
        Insert: {
          actual_cost_dkk?: number | null
          bed_count?: number | null
          bed_nights?: number | null
          booking_reference?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          estimated_cost_dkk?: number | null
          festival_id: string
          group_label?: string | null
          id?: string
          nights?: number | null
          notes?: string | null
          person_count?: number | null
          room_count?: number | null
          status?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_name: string
          venue_url?: string | null
        }
        Update: {
          actual_cost_dkk?: number | null
          bed_count?: number | null
          bed_nights?: number | null
          booking_reference?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          estimated_cost_dkk?: number | null
          festival_id?: string
          group_label?: string | null
          id?: string
          nights?: number | null
          notes?: string | null
          person_count?: number | null
          room_count?: number | null
          status?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_name?: string
          venue_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodation_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_accommodations: {
        Row: {
          address: string | null
          beds_total: number
          booking_ref: string | null
          booking_status: string | null
          check_in: string | null
          check_out: string | null
          cost_dkk: number | null
          created_at: string | null
          festival_id: string
          id: string
          name: string
          notes: string | null
          supplier_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          beds_total?: number
          booking_ref?: string | null
          booking_status?: string | null
          check_in?: string | null
          check_out?: string | null
          cost_dkk?: number | null
          created_at?: string | null
          festival_id: string
          id?: string
          name: string
          notes?: string | null
          supplier_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          beds_total?: number
          booking_ref?: string | null
          booking_status?: string | null
          check_in?: string | null
          check_out?: string | null
          cost_dkk?: number | null
          created_at?: string | null
          festival_id?: string
          id?: string
          name?: string
          notes?: string | null
          supplier_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_accommodations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_accommodations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_accommodations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_accommodations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_accommodations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_action_items: {
        Row: {
          category: string | null
          completed_at: string | null
          concept_id: string | null
          contract_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          festival_id: string
          id: string
          notes: string | null
          owner: string | null
          priority: string | null
          snoozed_until: string | null
          source: string | null
          source_ref: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          concept_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          snoozed_until?: string | null
          source?: string | null
          source_ref?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          concept_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          snoozed_until?: string | null
          source?: string | null
          source_ref?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_action_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_action_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_action_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_concept_assignments: {
        Row: {
          concept_id: string
          created_at: string | null
          festival_id: string
          id: string
          manager_staff_id: string | null
          notes: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          festival_id: string
          id?: string
          manager_staff_id?: string | null
          notes?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          manager_staff_id?: string | null
          notes?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_concept_assignments_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concept_assignments_manager_staff_id_fkey"
            columns: ["manager_staff_id"]
            isOneToOne: false
            referencedRelation: "festival_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_concept_city_assignments: {
        Row: {
          city: string
          created_at: string | null
          festival_contract_id: string
          id: string
          notes: string | null
          stall_label: string
          updated_at: string | null
        }
        Insert: {
          city: string
          created_at?: string | null
          festival_contract_id: string
          id?: string
          notes?: string | null
          stall_label: string
          updated_at?: string | null
        }
        Update: {
          city?: string
          created_at?: string | null
          festival_contract_id?: string
          id?: string
          notes?: string | null
          stall_label?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_concept_city_assignments_festival_contract_id_fkey"
            columns: ["festival_contract_id"]
            isOneToOne: false
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_concepts: {
        Row: {
          concept_id: string
          created_at: string | null
          dish_area_size: string | null
          festival_id: string
          has_dish_area: boolean | null
          id: string
          notes: string | null
          planned_headcount: number | null
          power_amps: number | null
          power_kw: number | null
          roles_breakdown: string | null
          stall_name: string | null
          tent_size: string | null
          zone: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          dish_area_size?: string | null
          festival_id: string
          has_dish_area?: boolean | null
          id?: string
          notes?: string | null
          planned_headcount?: number | null
          power_amps?: number | null
          power_kw?: number | null
          roles_breakdown?: string | null
          stall_name?: string | null
          tent_size?: string | null
          zone?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          dish_area_size?: string | null
          festival_id?: string
          has_dish_area?: boolean | null
          id?: string
          notes?: string | null
          planned_headcount?: number | null
          power_amps?: number | null
          power_kw?: number | null
          roles_breakdown?: string | null
          stall_name?: string | null
          tent_size?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_contacts: {
        Row: {
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string | null
          email: string | null
          festival_id: string
          full_name: string
          id: string
          is_primary: boolean
          last_contact_date: string | null
          notes: string | null
          organization: string | null
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string | null
          email?: string | null
          festival_id: string
          full_name: string
          id?: string
          is_primary?: boolean
          last_contact_date?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string | null
          email?: string | null
          festival_id?: string
          full_name?: string
          id?: string
          is_primary?: boolean
          last_contact_date?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contacts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_contracts: {
        Row: {
          allowed_beverages: string | null
          assigned_vehicle_id: string | null
          br18_facade_compliance_required: boolean | null
          cancelled_reason: string | null
          caravan_allowed: boolean | null
          caravan_booking_deadline: string | null
          caravan_camp: string | null
          caravan_max_count: number | null
          cleanup_radius_m: number | null
          concept_alias: string | null
          concept_id: string
          concept_variation_note: string | null
          contract_doc_url: string | null
          contract_expires_at: string | null
          contract_file_path: string | null
          contract_signed_by: string | null
          contract_signed_date: string | null
          contract_status: string | null
          contract_terms_summary: string | null
          contract_value_dkk: number | null
          contract_year: number | null
          contracting_entity: string
          contracting_entity_cvr: string | null
          counterparty_cvr: string | null
          counterparty_name: string | null
          counterparty_name_in_contract: string | null
          created_at: string | null
          drinks_revenue_share_pct: number | null
          expected_signing_by: string | null
          extra_power_unit_cost_dkk: number | null
          festival_id: string
          fixed_fee_dkk: number | null
          fixed_fee_includes_vat: boolean | null
          gluten_free_required: boolean | null
          id: string
          inspection_date: string | null
          inspection_self_paid_if_late: boolean | null
          inspection_time: string | null
          is_active: boolean
          key_obligations: string | null
          lactose_free_required: boolean | null
          max_partout_black: number | null
          max_partout_normal: number | null
          max_wristbands_total: number | null
          min_work_hours_for_partout: number | null
          notes: string | null
          operating_entity_cvr: string | null
          operating_hours_summary: string | null
          payment_method_cashless: boolean | null
          pos_provider: string | null
          pos_terminal_extra_cost_dkk: number | null
          power_in_contract: string | null
          revenue_share_tier_1_max_dkk: number | null
          revenue_share_tier_1_pct: number | null
          revenue_share_tier_2_max_dkk: number | null
          revenue_share_tier_2_pct: number | null
          revenue_share_tier_3_pct: number | null
          sent_to_counterparty_at: string | null
          settlement_terms: string | null
          signing_platform: string | null
          site_clearance_deadline: string | null
          stall_count: number | null
          stalled_reason: string | null
          stalled_since: string | null
          status_changed_at: string | null
          status_history: Json | null
          tent_cost_handling: string | null
          tent_floor: string | null
          tent_provided_by: string | null
          tent_shared_with_concept_id: string | null
          tent_size: string | null
          updated_at: string | null
          vegetarian_required: boolean | null
          vehicle_delivery_cutoff_time: string | null
          vehicle_permits: number | null
        }
        Insert: {
          allowed_beverages?: string | null
          assigned_vehicle_id?: string | null
          br18_facade_compliance_required?: boolean | null
          cancelled_reason?: string | null
          caravan_allowed?: boolean | null
          caravan_booking_deadline?: string | null
          caravan_camp?: string | null
          caravan_max_count?: number | null
          cleanup_radius_m?: number | null
          concept_alias?: string | null
          concept_id: string
          concept_variation_note?: string | null
          contract_doc_url?: string | null
          contract_expires_at?: string | null
          contract_file_path?: string | null
          contract_signed_by?: string | null
          contract_signed_date?: string | null
          contract_status?: string | null
          contract_terms_summary?: string | null
          contract_value_dkk?: number | null
          contract_year?: number | null
          contracting_entity: string
          contracting_entity_cvr?: string | null
          counterparty_cvr?: string | null
          counterparty_name?: string | null
          counterparty_name_in_contract?: string | null
          created_at?: string | null
          drinks_revenue_share_pct?: number | null
          expected_signing_by?: string | null
          extra_power_unit_cost_dkk?: number | null
          festival_id: string
          fixed_fee_dkk?: number | null
          fixed_fee_includes_vat?: boolean | null
          gluten_free_required?: boolean | null
          id?: string
          inspection_date?: string | null
          inspection_self_paid_if_late?: boolean | null
          inspection_time?: string | null
          is_active?: boolean
          key_obligations?: string | null
          lactose_free_required?: boolean | null
          max_partout_black?: number | null
          max_partout_normal?: number | null
          max_wristbands_total?: number | null
          min_work_hours_for_partout?: number | null
          notes?: string | null
          operating_entity_cvr?: string | null
          operating_hours_summary?: string | null
          payment_method_cashless?: boolean | null
          pos_provider?: string | null
          pos_terminal_extra_cost_dkk?: number | null
          power_in_contract?: string | null
          revenue_share_tier_1_max_dkk?: number | null
          revenue_share_tier_1_pct?: number | null
          revenue_share_tier_2_max_dkk?: number | null
          revenue_share_tier_2_pct?: number | null
          revenue_share_tier_3_pct?: number | null
          sent_to_counterparty_at?: string | null
          settlement_terms?: string | null
          signing_platform?: string | null
          site_clearance_deadline?: string | null
          stall_count?: number | null
          stalled_reason?: string | null
          stalled_since?: string | null
          status_changed_at?: string | null
          status_history?: Json | null
          tent_cost_handling?: string | null
          tent_floor?: string | null
          tent_provided_by?: string | null
          tent_shared_with_concept_id?: string | null
          tent_size?: string | null
          updated_at?: string | null
          vegetarian_required?: boolean | null
          vehicle_delivery_cutoff_time?: string | null
          vehicle_permits?: number | null
        }
        Update: {
          allowed_beverages?: string | null
          assigned_vehicle_id?: string | null
          br18_facade_compliance_required?: boolean | null
          cancelled_reason?: string | null
          caravan_allowed?: boolean | null
          caravan_booking_deadline?: string | null
          caravan_camp?: string | null
          caravan_max_count?: number | null
          cleanup_radius_m?: number | null
          concept_alias?: string | null
          concept_id?: string
          concept_variation_note?: string | null
          contract_doc_url?: string | null
          contract_expires_at?: string | null
          contract_file_path?: string | null
          contract_signed_by?: string | null
          contract_signed_date?: string | null
          contract_status?: string | null
          contract_terms_summary?: string | null
          contract_value_dkk?: number | null
          contract_year?: number | null
          contracting_entity?: string
          contracting_entity_cvr?: string | null
          counterparty_cvr?: string | null
          counterparty_name?: string | null
          counterparty_name_in_contract?: string | null
          created_at?: string | null
          drinks_revenue_share_pct?: number | null
          expected_signing_by?: string | null
          extra_power_unit_cost_dkk?: number | null
          festival_id?: string
          fixed_fee_dkk?: number | null
          fixed_fee_includes_vat?: boolean | null
          gluten_free_required?: boolean | null
          id?: string
          inspection_date?: string | null
          inspection_self_paid_if_late?: boolean | null
          inspection_time?: string | null
          is_active?: boolean
          key_obligations?: string | null
          lactose_free_required?: boolean | null
          max_partout_black?: number | null
          max_partout_normal?: number | null
          max_wristbands_total?: number | null
          min_work_hours_for_partout?: number | null
          notes?: string | null
          operating_entity_cvr?: string | null
          operating_hours_summary?: string | null
          payment_method_cashless?: boolean | null
          pos_provider?: string | null
          pos_terminal_extra_cost_dkk?: number | null
          power_in_contract?: string | null
          revenue_share_tier_1_max_dkk?: number | null
          revenue_share_tier_1_pct?: number | null
          revenue_share_tier_2_max_dkk?: number | null
          revenue_share_tier_2_pct?: number | null
          revenue_share_tier_3_pct?: number | null
          sent_to_counterparty_at?: string | null
          settlement_terms?: string | null
          signing_platform?: string | null
          site_clearance_deadline?: string | null
          stall_count?: number | null
          stalled_reason?: string | null
          stalled_since?: string | null
          status_changed_at?: string | null
          status_history?: Json | null
          tent_cost_handling?: string | null
          tent_floor?: string | null
          tent_provided_by?: string | null
          tent_shared_with_concept_id?: string | null
          tent_size?: string | null
          updated_at?: string | null
          vegetarian_required?: boolean | null
          vehicle_delivery_cutoff_time?: string | null
          vehicle_permits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_contracts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_contracts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_contracts_tent_shared_with_concept_id_fkey"
            columns: ["tent_shared_with_concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_contracts_tent_shared_with_concept_id_fkey"
            columns: ["tent_shared_with_concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "fk_fc_vehicle"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "festival_transport"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_contracts_finance: {
        Row: {
          contract_id: string
          counterparty: string | null
          created_at: string | null
          cvr: string | null
          id: string
          notes: string | null
          operating_entity: string | null
          payment_amount: number | null
          payment_currency: string | null
          payment_due_at: string | null
          payment_status: string | null
          payment_terms: string | null
          updated_at: string | null
        }
        Insert: {
          contract_id: string
          counterparty?: string | null
          created_at?: string | null
          cvr?: string | null
          id?: string
          notes?: string | null
          operating_entity?: string | null
          payment_amount?: number | null
          payment_currency?: string | null
          payment_due_at?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_id?: string
          counterparty?: string | null
          created_at?: string | null
          cvr?: string | null
          id?: string
          notes?: string | null
          operating_entity?: string | null
          payment_amount?: number | null
          payment_currency?: string | null
          payment_due_at?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_contracts_finance_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_cooling: {
        Row: {
          contract_amount_excl_vat_dkk: number | null
          contract_amount_incl_vat_dkk: number | null
          contract_notes: string | null
          cost_dkk: number | null
          created_at: string | null
          delivery_date: string | null
          delivery_time_earliest: string | null
          delivery_time_latest: string | null
          electrical_cable_length_m: number | null
          festival_id: string
          id: string
          lock_count: number | null
          notes: string | null
          payment_due: string | null
          payment_status: string | null
          pickup_date: string | null
          pickup_time_earliest: string | null
          pickup_time_latest: string | null
          power_connection: string | null
          supplier_booking_number: string | null
          supplier_id: string | null
          supplier_ref: string | null
          unit_type: string
          updated_at: string | null
        }
        Insert: {
          contract_amount_excl_vat_dkk?: number | null
          contract_amount_incl_vat_dkk?: number | null
          contract_notes?: string | null
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time_earliest?: string | null
          delivery_time_latest?: string | null
          electrical_cable_length_m?: number | null
          festival_id: string
          id?: string
          lock_count?: number | null
          notes?: string | null
          payment_due?: string | null
          payment_status?: string | null
          pickup_date?: string | null
          pickup_time_earliest?: string | null
          pickup_time_latest?: string | null
          power_connection?: string | null
          supplier_booking_number?: string | null
          supplier_id?: string | null
          supplier_ref?: string | null
          unit_type: string
          updated_at?: string | null
        }
        Update: {
          contract_amount_excl_vat_dkk?: number | null
          contract_amount_incl_vat_dkk?: number | null
          contract_notes?: string | null
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time_earliest?: string | null
          delivery_time_latest?: string | null
          electrical_cable_length_m?: number | null
          festival_id?: string
          id?: string
          lock_count?: number | null
          notes?: string | null
          payment_due?: string | null
          payment_status?: string | null
          pickup_date?: string | null
          pickup_time_earliest?: string | null
          pickup_time_latest?: string | null
          power_connection?: string | null
          supplier_booking_number?: string | null
          supplier_id?: string | null
          supplier_ref?: string | null
          unit_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_cooling_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_cooling_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_cooling_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_cooling_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_cooling_unit: {
        Row: {
          container_count: number | null
          container_type: string | null
          cooling_model: string
          cost_dkk: number | null
          created_at: string | null
          delivery_date: string | null
          festival_id: string
          id: string
          notes: string | null
          pallet_count_frys: number | null
          pallet_count_kol: number | null
          pickup_date: string | null
          status: string
          supplier: string | null
          unit_label: string
          updated_at: string | null
        }
        Insert: {
          container_count?: number | null
          container_type?: string | null
          cooling_model?: string
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          pallet_count_frys?: number | null
          pallet_count_kol?: number | null
          pickup_date?: string | null
          status?: string
          supplier?: string | null
          unit_label: string
          updated_at?: string | null
        }
        Update: {
          container_count?: number | null
          container_type?: string | null
          cooling_model?: string
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          pallet_count_frys?: number | null
          pallet_count_kol?: number | null
          pickup_date?: string | null
          status?: string
          supplier?: string | null
          unit_label?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_cooling_unit_concepts: {
        Row: {
          cooling_unit_id: string
          created_at: string | null
          festival_contract_id: string
          id: string
        }
        Insert: {
          cooling_unit_id: string
          created_at?: string | null
          festival_contract_id: string
          id?: string
        }
        Update: {
          cooling_unit_id?: string
          created_at?: string | null
          festival_contract_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_cooling_unit_concepts_cooling_unit_id_fkey"
            columns: ["cooling_unit_id"]
            isOneToOne: false
            referencedRelation: "festival_cooling_unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_cooling_unit_concepts_festival_contract_id_fkey"
            columns: ["festival_contract_id"]
            isOneToOne: false
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_daka: {
        Row: {
          concept_id: string | null
          container_label: string
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          pickup_arrangement: string | null
          pickup_date: string | null
          quantity: number | null
        }
        Insert: {
          concept_id?: string | null
          container_label: string
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          pickup_arrangement?: string | null
          pickup_date?: string | null
          quantity?: number | null
        }
        Update: {
          concept_id?: string | null
          container_label?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          pickup_arrangement?: string | null
          pickup_date?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_daka_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_daka_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_daka_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_deadlines: {
        Row: {
          consequence: string | null
          created_at: string | null
          deadline_at: string
          description: string | null
          festival_id: string
          id: string
          is_hard: boolean | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          consequence?: string | null
          created_at?: string | null
          deadline_at: string
          description?: string | null
          festival_id: string
          id?: string
          is_hard?: boolean | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          consequence?: string | null
          created_at?: string | null
          deadline_at?: string
          description?: string | null
          festival_id?: string
          id?: string
          is_hard?: boolean | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_equipment: {
        Row: {
          brand: string | null
          category: string | null
          concept_id: string | null
          created_at: string | null
          equipment_id: string | null
          estimated_kw: number | null
          festival_id: string
          fuel_type: string | null
          id: string
          is_shared_between_concepts: boolean | null
          is_spare: boolean | null
          model: string | null
          name: string | null
          notes: string | null
          ownership: string | null
          ownership_override: string | null
          position_notes: string | null
          position_zone: string | null
          power_unit: string | null
          qty: number
          quantity: number | null
          rental_cost_dkk: number | null
          rental_supplier_id: string | null
          requires_inspection: boolean | null
          shared_concept_ids: string[] | null
          updated_at: string | null
          zone: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          concept_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          estimated_kw?: number | null
          festival_id: string
          fuel_type?: string | null
          id?: string
          is_shared_between_concepts?: boolean | null
          is_spare?: boolean | null
          model?: string | null
          name?: string | null
          notes?: string | null
          ownership?: string | null
          ownership_override?: string | null
          position_notes?: string | null
          position_zone?: string | null
          power_unit?: string | null
          qty?: number
          quantity?: number | null
          rental_cost_dkk?: number | null
          rental_supplier_id?: string | null
          requires_inspection?: boolean | null
          shared_concept_ids?: string[] | null
          updated_at?: string | null
          zone?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          concept_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          estimated_kw?: number | null
          festival_id?: string
          fuel_type?: string | null
          id?: string
          is_shared_between_concepts?: boolean | null
          is_spare?: boolean | null
          model?: string | null
          name?: string | null
          notes?: string | null
          ownership?: string | null
          ownership_override?: string | null
          position_notes?: string | null
          position_zone?: string | null
          power_unit?: string | null
          qty?: number
          quantity?: number | null
          rental_cost_dkk?: number | null
          rental_supplier_id?: string | null
          requires_inspection?: boolean | null
          shared_concept_ids?: string[] | null
          updated_at?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_equipment_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_equipment_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_equipment_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_equipment_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_equipment_transport: {
        Row: {
          arrival_at: string | null
          capacity_notes: string | null
          created_at: string | null
          departure_at: string | null
          departure_warehouse: string | null
          driver_staff_id: string | null
          festival_id: string
          id: string
          load_manifest: string | null
          notes: string | null
          return_at: string | null
          status: string | null
          updated_at: string | null
          vehicle_name: string
          vehicle_type: string | null
        }
        Insert: {
          arrival_at?: string | null
          capacity_notes?: string | null
          created_at?: string | null
          departure_at?: string | null
          departure_warehouse?: string | null
          driver_staff_id?: string | null
          festival_id: string
          id?: string
          load_manifest?: string | null
          notes?: string | null
          return_at?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_name: string
          vehicle_type?: string | null
        }
        Update: {
          arrival_at?: string | null
          capacity_notes?: string | null
          created_at?: string | null
          departure_at?: string | null
          departure_warehouse?: string | null
          driver_staff_id?: string | null
          festival_id?: string
          id?: string
          load_manifest?: string | null
          notes?: string | null
          return_at?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_name?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_equipment_transport_driver_staff_id_fkey"
            columns: ["driver_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_equipment_transport_items: {
        Row: {
          created_at: string | null
          festival_equipment_id: string
          id: string
          notes: string | null
          qty: number
          transport_id: string
        }
        Insert: {
          created_at?: string | null
          festival_equipment_id: string
          id?: string
          notes?: string | null
          qty?: number
          transport_id: string
        }
        Update: {
          created_at?: string | null
          festival_equipment_id?: string
          id?: string
          notes?: string | null
          qty?: number
          transport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_equipment_transport_items_festival_equipment_id_fkey"
            columns: ["festival_equipment_id"]
            isOneToOne: false
            referencedRelation: "festival_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_equipment_transport_items_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: false
            referencedRelation: "festival_equipment_transport"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_facade: {
        Row: {
          cost_dkk: number | null
          created_at: string
          design_concept_note: string | null
          design_file_path: string | null
          design_preview_path: string | null
          design_status: string
          dimensions_h_cm: number | null
          dimensions_text: string | null
          dimensions_w_cm: number | null
          festival_approval_contact_id: string | null
          festival_approval_received_at: string | null
          festival_approval_required: boolean
          festival_contract_id: string
          id: string
          installation_notes: string | null
          material_deadline: string | null
          material_orders_status: string | null
          material_supplier: string | null
          material_type: string | null
          notes: string | null
          panel_count: number
          print_deadline: string | null
          reuse_modifications: string | null
          reused_from: string | null
          status_history: Json
          updated_at: string
        }
        Insert: {
          cost_dkk?: number | null
          created_at?: string
          design_concept_note?: string | null
          design_file_path?: string | null
          design_preview_path?: string | null
          design_status?: string
          dimensions_h_cm?: number | null
          dimensions_text?: string | null
          dimensions_w_cm?: number | null
          festival_approval_contact_id?: string | null
          festival_approval_received_at?: string | null
          festival_approval_required?: boolean
          festival_contract_id: string
          id?: string
          installation_notes?: string | null
          material_deadline?: string | null
          material_orders_status?: string | null
          material_supplier?: string | null
          material_type?: string | null
          notes?: string | null
          panel_count?: number
          print_deadline?: string | null
          reuse_modifications?: string | null
          reused_from?: string | null
          status_history?: Json
          updated_at?: string
        }
        Update: {
          cost_dkk?: number | null
          created_at?: string
          design_concept_note?: string | null
          design_file_path?: string | null
          design_preview_path?: string | null
          design_status?: string
          dimensions_h_cm?: number | null
          dimensions_text?: string | null
          dimensions_w_cm?: number | null
          festival_approval_contact_id?: string | null
          festival_approval_received_at?: string | null
          festival_approval_required?: boolean
          festival_contract_id?: string
          id?: string
          installation_notes?: string | null
          material_deadline?: string | null
          material_orders_status?: string | null
          material_supplier?: string | null
          material_type?: string | null
          notes?: string | null
          panel_count?: number
          print_deadline?: string | null
          reuse_modifications?: string | null
          reused_from?: string | null
          status_history?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_facade_festival_approval_contact_id_fkey"
            columns: ["festival_approval_contact_id"]
            isOneToOne: false
            referencedRelation: "festival_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_facade_festival_contract_id_fkey"
            columns: ["festival_contract_id"]
            isOneToOne: true
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_facade_status: {
        Row: {
          br18_compliance_status: string | null
          concept_id: string
          created_at: string | null
          design_deadline: string | null
          design_status: string
          festival_id: string
          has_aluminium_frame: boolean | null
          has_flag: boolean | null
          has_logo: boolean | null
          has_menu: boolean | null
          has_menu_lights: boolean | null
          has_printed_panels: boolean | null
          id: string
          notes: string | null
          print_deadline: string | null
          updated_at: string | null
        }
        Insert: {
          br18_compliance_status?: string | null
          concept_id: string
          created_at?: string | null
          design_deadline?: string | null
          design_status: string
          festival_id: string
          has_aluminium_frame?: boolean | null
          has_flag?: boolean | null
          has_logo?: boolean | null
          has_menu?: boolean | null
          has_menu_lights?: boolean | null
          has_printed_panels?: boolean | null
          id?: string
          notes?: string | null
          print_deadline?: string | null
          updated_at?: string | null
        }
        Update: {
          br18_compliance_status?: string | null
          concept_id?: string
          created_at?: string | null
          design_deadline?: string | null
          design_status?: string
          festival_id?: string
          has_aluminium_frame?: boolean | null
          has_flag?: boolean | null
          has_logo?: boolean | null
          has_menu?: boolean | null
          has_menu_lights?: boolean | null
          has_printed_panels?: boolean | null
          id?: string
          notes?: string | null
          print_deadline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_facade_status_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_facade_status_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_status_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_finance_costs: {
        Row: {
          amount_currency: string | null
          amount_dkk: number
          amount_original: number | null
          attached_invoice_path: string | null
          concept_id: string | null
          contract_id: string | null
          cost_category: string
          created_at: string
          description: string | null
          festival_id: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_jonas_commission: boolean | null
          notes: string | null
          paid_by_entity: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          subcategory: string | null
          supplier_name: string | null
          updated_at: string
          vat_dkk: number | null
          vat_rate: number | null
        }
        Insert: {
          amount_currency?: string | null
          amount_dkk: number
          amount_original?: number | null
          attached_invoice_path?: string | null
          concept_id?: string | null
          contract_id?: string | null
          cost_category: string
          created_at?: string
          description?: string | null
          festival_id: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_jonas_commission?: boolean | null
          notes?: string | null
          paid_by_entity?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          subcategory?: string | null
          supplier_name?: string | null
          updated_at?: string
          vat_dkk?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount_currency?: string | null
          amount_dkk?: number
          amount_original?: number | null
          attached_invoice_path?: string | null
          concept_id?: string | null
          contract_id?: string | null
          cost_category?: string
          created_at?: string
          description?: string | null
          festival_id?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_jonas_commission?: boolean | null
          notes?: string | null
          paid_by_entity?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          subcategory?: string | null
          supplier_name?: string | null
          updated_at?: string
          vat_dkk?: number | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      festival_finance_revenue: {
        Row: {
          amount_dkk: number
          concept_id: string | null
          contract_id: string | null
          created_at: string
          festival_id: string
          id: string
          notes: string | null
          received_into_entity: string | null
          revenue_date: string | null
          revenue_source: string | null
          transaction_count: number | null
          vat_dkk: number | null
        }
        Insert: {
          amount_dkk: number
          concept_id?: string | null
          contract_id?: string | null
          created_at?: string
          festival_id: string
          id?: string
          notes?: string | null
          received_into_entity?: string | null
          revenue_date?: string | null
          revenue_source?: string | null
          transaction_count?: number | null
          vat_dkk?: number | null
        }
        Update: {
          amount_dkk?: number
          concept_id?: string | null
          contract_id?: string | null
          created_at?: string
          festival_id?: string
          id?: string
          notes?: string | null
          received_into_entity?: string | null
          revenue_date?: string | null
          revenue_source?: string | null
          transaction_count?: number | null
          vat_dkk?: number | null
        }
        Relationships: []
      }
      festival_forecasts: {
        Row: {
          created_at: string | null
          day_date: string
          dish_id: string
          expected_portions: number
          festival_id: string
          id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_date: string
          dish_id: string
          expected_portions?: number
          festival_id: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_date?: string
          dish_id?: string
          expected_portions?: number
          festival_id?: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_forecasts_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_hours: {
        Row: {
          created_at: string
          day_date: string
          festival_close: string | null
          festival_id: string
          festival_open: string | null
          id: string
          notes: string | null
          prep_close: string | null
          prep_open: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_date: string
          festival_close?: string | null
          festival_id: string
          festival_open?: string | null
          id?: string
          notes?: string | null
          prep_close?: string | null
          prep_open?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_date?: string
          festival_close?: string | null
          festival_id?: string
          festival_open?: string | null
          id?: string
          notes?: string | null
          prep_close?: string | null
          prep_open?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_ingredient_manual: {
        Row: {
          entered_at: string | null
          entered_by: string | null
          festival_id: string
          id: string
          ingredient_id: string
          notes: string | null
          qty: number
          unit: string
          updated_at: string | null
        }
        Insert: {
          entered_at?: string | null
          entered_by?: string | null
          festival_id: string
          id?: string
          ingredient_id: string
          notes?: string | null
          qty: number
          unit: string
          updated_at?: string | null
        }
        Update: {
          entered_at?: string | null
          entered_by?: string | null
          festival_id?: string
          id?: string
          ingredient_id?: string
          notes?: string | null
          qty?: number
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "festival_ingredient_manual_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["ingredient_id"]
          },
        ]
      }
      festival_location_documents: {
        Row: {
          description: string | null
          festival_id: string
          file_name: string
          file_path: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          description?: string | null
          festival_id: string
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          description?: string | null
          festival_id?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_location_documents_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_open_questions: {
        Row: {
          blocking_what: string | null
          concept_id: string | null
          context: string | null
          contract_id: string | null
          created_at: string | null
          deadline: string | null
          decision_owner: string | null
          escalated_at: string | null
          festival_id: string
          id: string
          priority: string | null
          question: string
          question_type: string | null
          raised_by: string | null
          raised_date: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_date: string | null
          show_on_overview: boolean
          status: string | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          blocking_what?: string | null
          concept_id?: string | null
          context?: string | null
          contract_id?: string | null
          created_at?: string | null
          deadline?: string | null
          decision_owner?: string | null
          escalated_at?: string | null
          festival_id: string
          id?: string
          priority?: string | null
          question: string
          question_type?: string | null
          raised_by?: string | null
          raised_date?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_date?: string | null
          show_on_overview?: boolean
          status?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          blocking_what?: string | null
          concept_id?: string | null
          context?: string | null
          contract_id?: string | null
          created_at?: string | null
          deadline?: string | null
          decision_owner?: string | null
          escalated_at?: string | null
          festival_id?: string
          id?: string
          priority?: string | null
          question?: string
          question_type?: string | null
          raised_by?: string | null
          raised_date?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_date?: string | null
          show_on_overview?: boolean
          status?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_open_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_open_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_open_questions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_open_questions_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_power: {
        Row: {
          connections_125a: number | null
          connections_16a_240v: number | null
          connections_16a_400v: number | null
          connections_32a: number | null
          connections_63a: number | null
          cost_dkk: number | null
          created_at: string | null
          equipment_breakdown: string | null
          equipment_variant: string
          festival_contract_id: string
          id: string
          notes: string | null
          ordered_date: string | null
          power_drawing_file_path: string | null
          power_drawing_uploaded_at: string | null
          shared_tent_with_contracts: string[] | null
          status: string
          submission_deadline: string | null
          tableau_count: number | null
          tableau_required: boolean | null
          tent_location: string | null
          total_amp_estimate: number | null
          total_kw_estimate: number | null
          updated_at: string | null
        }
        Insert: {
          connections_125a?: number | null
          connections_16a_240v?: number | null
          connections_16a_400v?: number | null
          connections_32a?: number | null
          connections_63a?: number | null
          cost_dkk?: number | null
          created_at?: string | null
          equipment_breakdown?: string | null
          equipment_variant?: string
          festival_contract_id: string
          id?: string
          notes?: string | null
          ordered_date?: string | null
          power_drawing_file_path?: string | null
          power_drawing_uploaded_at?: string | null
          shared_tent_with_contracts?: string[] | null
          status?: string
          submission_deadline?: string | null
          tableau_count?: number | null
          tableau_required?: boolean | null
          tent_location?: string | null
          total_amp_estimate?: number | null
          total_kw_estimate?: number | null
          updated_at?: string | null
        }
        Update: {
          connections_125a?: number | null
          connections_16a_240v?: number | null
          connections_16a_400v?: number | null
          connections_32a?: number | null
          connections_63a?: number | null
          cost_dkk?: number | null
          created_at?: string | null
          equipment_breakdown?: string | null
          equipment_variant?: string
          festival_contract_id?: string
          id?: string
          notes?: string | null
          ordered_date?: string | null
          power_drawing_file_path?: string | null
          power_drawing_uploaded_at?: string | null
          shared_tent_with_contracts?: string[] | null
          status?: string
          submission_deadline?: string | null
          tableau_count?: number | null
          tableau_required?: boolean | null
          tent_location?: string | null
          total_amp_estimate?: number | null
          total_kw_estimate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_power_festival_contract_id_fkey"
            columns: ["festival_contract_id"]
            isOneToOne: true
            referencedRelation: "festival_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_power_equipment: {
        Row: {
          category: string
          created_at: string | null
          equipment_name: string
          festival_power_id: string
          id: string
          is_powered: boolean
          is_shared: boolean | null
          linked_facade_id: string | null
          linked_topskilt_id: string | null
          loads_from_soborg: boolean
          notes: string | null
          position: number
          power_kw: number | null
          power_type: string | null
          quantity: number
          shared_with_concepts: string[] | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          equipment_name: string
          festival_power_id: string
          id?: string
          is_powered?: boolean
          is_shared?: boolean | null
          linked_facade_id?: string | null
          linked_topskilt_id?: string | null
          loads_from_soborg?: boolean
          notes?: string | null
          position?: number
          power_kw?: number | null
          power_type?: string | null
          quantity?: number
          shared_with_concepts?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          equipment_name?: string
          festival_power_id?: string
          id?: string
          is_powered?: boolean
          is_shared?: boolean | null
          linked_facade_id?: string | null
          linked_topskilt_id?: string | null
          loads_from_soborg?: boolean
          notes?: string | null
          position?: number
          power_kw?: number | null
          power_type?: string | null
          quantity?: number
          shared_with_concepts?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_power_equipment_festival_power_id_fkey"
            columns: ["festival_power_id"]
            isOneToOne: false
            referencedRelation: "festival_power"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fpe_facade"
            columns: ["linked_facade_id"]
            isOneToOne: false
            referencedRelation: "festival_facade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fpe_topskilt"
            columns: ["linked_topskilt_id"]
            isOneToOne: false
            referencedRelation: "festival_topskilt"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_power_legacy: {
        Row: {
          concept_id: string
          created_at: string | null
          estimated_amps: number | null
          estimated_kw: number | null
          extra_cost_dkk: number | null
          festival_id: string
          id: string
          is_current: boolean | null
          notes: string | null
          power_unit: string
          purpose: string | null
          quantity: number
          source: string
          source_date: string | null
          source_reference: string | null
          updated_at: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          estimated_amps?: number | null
          estimated_kw?: number | null
          extra_cost_dkk?: number | null
          festival_id: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          power_unit: string
          purpose?: string | null
          quantity: number
          source: string
          source_date?: string | null
          source_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          estimated_amps?: number | null
          estimated_kw?: number | null
          extra_cost_dkk?: number | null
          festival_id?: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          power_unit?: string
          purpose?: string | null
          quantity?: number
          source?: string
          source_date?: string | null
          source_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_power_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_power_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_power_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_reports: {
        Row: {
          audience: string | null
          created_at: string | null
          festival_id: string
          file_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          notes: string | null
          report_type: string
          sent_at: string | null
          sent_to_email: string | null
        }
        Insert: {
          audience?: string | null
          created_at?: string | null
          festival_id: string
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          notes?: string | null
          report_type: string
          sent_at?: string | null
          sent_to_email?: string | null
        }
        Update: {
          audience?: string | null
          created_at?: string | null
          festival_id?: string
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          notes?: string | null
          report_type?: string
          sent_at?: string | null
          sent_to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_reports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_safety: {
        Row: {
          additional_notes: string | null
          created_at: string
          electrical_certification_date: string | null
          electrical_certification_path: string | null
          electrical_certification_status: Database["public"]["Enums"]["safety_electrical_status"]
          electrical_certifier: string | null
          emergency_contacts_text: string | null
          festival_id: string
          fire_safety_blanket_count: number | null
          fire_safety_evacuation_plan_path: string | null
          fire_safety_extinguishers_count: number | null
          fire_safety_extinguishers_inspection_date: string | null
          first_aid_certified_staff_count: number | null
          first_aid_kit_count: number | null
          first_aid_kit_locations: string | null
          first_aid_responsible: string | null
          food_authority_certificate_path: string | null
          food_authority_inspection_date: string | null
          food_authority_lead: string | null
          food_authority_notes: string | null
          food_authority_status: Database["public"]["Enums"]["safety_food_status"]
          gas_safety_certificate_path: string | null
          gas_safety_date: string | null
          gas_safety_inspector: string | null
          gas_safety_notes: string | null
          gas_safety_required: boolean
          gas_safety_status: Database["public"]["Enums"]["safety_gas_status"]
          gas_safety_time: string | null
          id: string
          insurance_certificate_path: string | null
          insurance_coverage_summary: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          safety_briefing_attendees: string[] | null
          safety_briefing_completed: boolean
          safety_briefing_date: string | null
          status_history: Json
          updated_at: string
        }
        Insert: {
          additional_notes?: string | null
          created_at?: string
          electrical_certification_date?: string | null
          electrical_certification_path?: string | null
          electrical_certification_status?: Database["public"]["Enums"]["safety_electrical_status"]
          electrical_certifier?: string | null
          emergency_contacts_text?: string | null
          festival_id: string
          fire_safety_blanket_count?: number | null
          fire_safety_evacuation_plan_path?: string | null
          fire_safety_extinguishers_count?: number | null
          fire_safety_extinguishers_inspection_date?: string | null
          first_aid_certified_staff_count?: number | null
          first_aid_kit_count?: number | null
          first_aid_kit_locations?: string | null
          first_aid_responsible?: string | null
          food_authority_certificate_path?: string | null
          food_authority_inspection_date?: string | null
          food_authority_lead?: string | null
          food_authority_notes?: string | null
          food_authority_status?: Database["public"]["Enums"]["safety_food_status"]
          gas_safety_certificate_path?: string | null
          gas_safety_date?: string | null
          gas_safety_inspector?: string | null
          gas_safety_notes?: string | null
          gas_safety_required?: boolean
          gas_safety_status?: Database["public"]["Enums"]["safety_gas_status"]
          gas_safety_time?: string | null
          id?: string
          insurance_certificate_path?: string | null
          insurance_coverage_summary?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          safety_briefing_attendees?: string[] | null
          safety_briefing_completed?: boolean
          safety_briefing_date?: string | null
          status_history?: Json
          updated_at?: string
        }
        Update: {
          additional_notes?: string | null
          created_at?: string
          electrical_certification_date?: string | null
          electrical_certification_path?: string | null
          electrical_certification_status?: Database["public"]["Enums"]["safety_electrical_status"]
          electrical_certifier?: string | null
          emergency_contacts_text?: string | null
          festival_id?: string
          fire_safety_blanket_count?: number | null
          fire_safety_evacuation_plan_path?: string | null
          fire_safety_extinguishers_count?: number | null
          fire_safety_extinguishers_inspection_date?: string | null
          first_aid_certified_staff_count?: number | null
          first_aid_kit_count?: number | null
          first_aid_kit_locations?: string | null
          first_aid_responsible?: string | null
          food_authority_certificate_path?: string | null
          food_authority_inspection_date?: string | null
          food_authority_lead?: string | null
          food_authority_notes?: string | null
          food_authority_status?: Database["public"]["Enums"]["safety_food_status"]
          gas_safety_certificate_path?: string | null
          gas_safety_date?: string | null
          gas_safety_inspector?: string | null
          gas_safety_notes?: string | null
          gas_safety_required?: boolean
          gas_safety_status?: Database["public"]["Enums"]["safety_gas_status"]
          gas_safety_time?: string | null
          id?: string
          insurance_certificate_path?: string | null
          insurance_coverage_summary?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          safety_briefing_attendees?: string[] | null
          safety_briefing_completed?: boolean
          safety_briefing_date?: string | null
          status_history?: Json
          updated_at?: string
        }
        Relationships: []
      }
      festival_safety_legacy: {
        Row: {
          created_at: string | null
          festival_id: string
          id: string
          item_class: string | null
          item_type: string
          location: string | null
          notes: string | null
          qty: number
        }
        Insert: {
          created_at?: string | null
          festival_id: string
          id?: string
          item_class?: string | null
          item_type: string
          location?: string | null
          notes?: string | null
          qty?: number
        }
        Update: {
          created_at?: string | null
          festival_id?: string
          id?: string
          item_class?: string | null
          item_type?: string
          location?: string | null
          notes?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_service_hours: {
        Row: {
          close_time: string | null
          concept_id: string | null
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          open_time: string | null
          service_date: string
          updated_at: string | null
        }
        Insert: {
          close_time?: string | null
          concept_id?: string | null
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          open_time?: string | null
          service_date: string
          updated_at?: string | null
        }
        Update: {
          close_time?: string | null
          concept_id?: string | null
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          open_time?: string | null
          service_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_service_hours_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_service_hours_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_service_hours_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_setup: {
        Row: {
          actual_cost_dkk: number | null
          actual_end_at: string | null
          actual_start_at: string | null
          concept_id: string | null
          contractor_supplier_id: string | null
          created_at: string | null
          crew_lead: string | null
          crew_size: number | null
          description: string
          estimated_cost_dkk: number | null
          festival_id: string
          id: string
          invoice_paid: boolean | null
          invoice_received: boolean | null
          notes: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          status: string | null
          updated_at: string | null
          work_type: string
        }
        Insert: {
          actual_cost_dkk?: number | null
          actual_end_at?: string | null
          actual_start_at?: string | null
          concept_id?: string | null
          contractor_supplier_id?: string | null
          created_at?: string | null
          crew_lead?: string | null
          crew_size?: number | null
          description: string
          estimated_cost_dkk?: number | null
          festival_id: string
          id?: string
          invoice_paid?: boolean | null
          invoice_received?: boolean | null
          notes?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          status?: string | null
          updated_at?: string | null
          work_type: string
        }
        Update: {
          actual_cost_dkk?: number | null
          actual_end_at?: string | null
          actual_start_at?: string | null
          concept_id?: string | null
          contractor_supplier_id?: string | null
          created_at?: string | null
          crew_lead?: string | null
          crew_size?: number | null
          description?: string
          estimated_cost_dkk?: number | null
          festival_id?: string
          id?: string
          invoice_paid?: boolean | null
          invoice_received?: boolean | null
          notes?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          status?: string | null
          updated_at?: string | null
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_setup_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_setup_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_setup_contractor_supplier_id_fkey"
            columns: ["contractor_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_setup_contractor_supplier_id_fkey"
            columns: ["contractor_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_setup_contractor_supplier_id_fkey"
            columns: ["contractor_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_setup_contractor_supplier_id_fkey"
            columns: ["contractor_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_setup_contractor_supplier_id_fkey"
            columns: ["contractor_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_setup_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_shifts: {
        Row: {
          concept_id: string | null
          created_at: string | null
          crosses_midnight: boolean | null
          end_time: string
          festival_id: string
          hours: number | null
          id: string
          notes: string | null
          planned_crew_size: number | null
          role: string | null
          shift_date: string
          shift_name: string | null
          shift_type: string | null
          staff_id: string | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          concept_id?: string | null
          created_at?: string | null
          crosses_midnight?: boolean | null
          end_time: string
          festival_id: string
          hours?: number | null
          id?: string
          notes?: string | null
          planned_crew_size?: number | null
          role?: string | null
          shift_date: string
          shift_name?: string | null
          shift_type?: string | null
          staff_id?: string | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          concept_id?: string | null
          created_at?: string | null
          crosses_midnight?: boolean | null
          end_time?: string
          festival_id?: string
          hours?: number | null
          id?: string
          notes?: string | null
          planned_crew_size?: number | null
          role?: string | null
          shift_date?: string
          shift_name?: string | null
          shift_type?: string | null
          staff_id?: string | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_shifts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_shifts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_staff: {
        Row: {
          concept_id: string | null
          confirmed: boolean | null
          created_at: string | null
          festival_id: string
          home_location: string | null
          id: string
          name: string | null
          notes: string | null
          requires_transport: boolean
          role: string
          staff_source: string
          staff_type: string | null
          total_hours_planned: number | null
          updated_at: string | null
          works_friday: boolean | null
          works_saturday: boolean | null
          works_sunday: boolean | null
          works_thursday: boolean | null
          wristband_type: string | null
        }
        Insert: {
          concept_id?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          festival_id: string
          home_location?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          requires_transport?: boolean
          role: string
          staff_source: string
          staff_type?: string | null
          total_hours_planned?: number | null
          updated_at?: string | null
          works_friday?: boolean | null
          works_saturday?: boolean | null
          works_sunday?: boolean | null
          works_thursday?: boolean | null
          wristband_type?: string | null
        }
        Update: {
          concept_id?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          festival_id?: string
          home_location?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          requires_transport?: boolean
          role?: string
          staff_source?: string
          staff_type?: string | null
          total_hours_planned?: number | null
          updated_at?: string | null
          works_friday?: boolean | null
          works_saturday?: boolean | null
          works_sunday?: boolean | null
          works_thursday?: boolean | null
          wristband_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_staff_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_staff_vehicle_seats: {
        Row: {
          created_at: string | null
          direction: string
          id: string
          notes: string | null
          staff_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          direction?: string
          id?: string
          notes?: string | null
          staff_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          direction?: string
          id?: string
          notes?: string | null
          staff_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_staff_vehicle_seats_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_vehicle_seats_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "festival_staff_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_staff_vehicles: {
        Row: {
          created_at: string | null
          driver_staff_id: string | null
          festival_id: string
          id: string
          notes: string | null
          pickup_at: string | null
          rental_cost_dkk: number | null
          rental_supplier_id: string | null
          return_at: string | null
          seats_total: number | null
          status: string | null
          updated_at: string | null
          vehicle_name: string
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string | null
          driver_staff_id?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          pickup_at?: string | null
          rental_cost_dkk?: number | null
          rental_supplier_id?: string | null
          return_at?: string | null
          seats_total?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_name: string
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string | null
          driver_staff_id?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          pickup_at?: string | null
          rental_cost_dkk?: number | null
          rental_supplier_id?: string | null
          return_at?: string | null
          seats_total?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_name?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_staff_vehicles_driver_staff_id_fkey"
            columns: ["driver_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_staff_vehicles_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_timeline_event: {
        Row: {
          completed_at: string | null
          concepts_involved: string[] | null
          confirmed_at: string | null
          contracts_involved: string[] | null
          created_at: string
          end_date: string | null
          end_time: string | null
          event_date: string
          event_time: string | null
          event_type: string
          festival_id: string
          id: string
          linked_action_item_id: string | null
          linked_supplier_name: string | null
          location: string | null
          notes: string | null
          responsible_contact_id: string | null
          responsible_party: string
          status: string
          supplier_contact_phone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          concepts_involved?: string[] | null
          confirmed_at?: string | null
          contracts_involved?: string[] | null
          created_at?: string
          end_date?: string | null
          end_time?: string | null
          event_date: string
          event_time?: string | null
          event_type: string
          festival_id: string
          id?: string
          linked_action_item_id?: string | null
          linked_supplier_name?: string | null
          location?: string | null
          notes?: string | null
          responsible_contact_id?: string | null
          responsible_party?: string
          status?: string
          supplier_contact_phone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          concepts_involved?: string[] | null
          confirmed_at?: string | null
          contracts_involved?: string[] | null
          created_at?: string
          end_date?: string | null
          end_time?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: string
          festival_id?: string
          id?: string
          linked_action_item_id?: string | null
          linked_supplier_name?: string | null
          location?: string | null
          notes?: string | null
          responsible_contact_id?: string | null
          responsible_party?: string
          status?: string
          supplier_contact_phone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      festival_topskilt: {
        Row: {
          created_at: string
          design_status: string
          festival_contract_id: string
          id: string
          notes: string | null
          print_deadline: string | null
          print_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          design_status?: string
          festival_contract_id: string
          id?: string
          notes?: string | null
          print_deadline?: string | null
          print_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          design_status?: string
          festival_contract_id?: string
          id?: string
          notes?: string | null
          print_deadline?: string | null
          print_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      festival_transport: {
        Row: {
          accreditation_pdf_path: string | null
          accreditation_uploaded_at: string | null
          actual_cost_dkk: number | null
          booking_reference: string | null
          capacity: number | null
          created_at: string | null
          estimated_cost_dkk: number | null
          festival_id: string
          id: string
          license_plate: string | null
          notes: string | null
          pickup_date: string | null
          pickup_location: string | null
          pickup_time: string | null
          rental_supplier: string | null
          rental_supplier_id: string | null
          return_date: string | null
          return_location: string | null
          return_time: string | null
          season_rental_id: string | null
          status: string | null
          updated_at: string | null
          vehicle_purpose: string | null
          vehicle_type: string
        }
        Insert: {
          accreditation_pdf_path?: string | null
          accreditation_uploaded_at?: string | null
          actual_cost_dkk?: number | null
          booking_reference?: string | null
          capacity?: number | null
          created_at?: string | null
          estimated_cost_dkk?: number | null
          festival_id: string
          id?: string
          license_plate?: string | null
          notes?: string | null
          pickup_date?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          rental_supplier?: string | null
          rental_supplier_id?: string | null
          return_date?: string | null
          return_location?: string | null
          return_time?: string | null
          season_rental_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_purpose?: string | null
          vehicle_type: string
        }
        Update: {
          accreditation_pdf_path?: string | null
          accreditation_uploaded_at?: string | null
          actual_cost_dkk?: number | null
          booking_reference?: string | null
          capacity?: number | null
          created_at?: string | null
          estimated_cost_dkk?: number | null
          festival_id?: string
          id?: string
          license_plate?: string | null
          notes?: string | null
          pickup_date?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          rental_supplier?: string | null
          rental_supplier_id?: string | null
          return_date?: string | null
          return_location?: string | null
          return_time?: string | null
          season_rental_id?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_purpose?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_transport_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_transport_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_transport_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "festival_transport_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_transport_rental_supplier_id_fkey"
            columns: ["rental_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "festival_transport_season_rental_id_fkey"
            columns: ["season_rental_id"]
            isOneToOne: false
            referencedRelation: "season_rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_trolley_items: {
        Row: {
          concept_id: string
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          qty: number
          trolley_item_id: string
          trolley_number: number
          updated_at: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          qty: number
          trolley_item_id: string
          trolley_number?: number
          updated_at?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          qty?: number
          trolley_item_id?: string
          trolley_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_trolley_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_trolley_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["concept_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_trolley_item_id_fkey"
            columns: ["trolley_item_id"]
            isOneToOne: false
            referencedRelation: "trolley_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_trolley_items_trolley_item_id_fkey"
            columns: ["trolley_item_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "festival_trolley_items_trolley_item_id_fkey"
            columns: ["trolley_item_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["item_id"]
          },
        ]
      }
      festivals: {
        Row: {
          address: string | null
          breakdown_date: string | null
          city: string | null
          confirmation_status: string | null
          contact_contract_email: string | null
          contact_contract_name: string | null
          contact_contract_phone: string | null
          contact_operations_email: string | null
          contact_operations_name: string | null
          contact_operations_phone: string | null
          country: string | null
          created_at: string | null
          end_date: string
          festival_duration_days: number | null
          id: string
          is_active: boolean | null
          lat: number | null
          lng: number | null
          menu_summary: string | null
          name: string
          notes: string | null
          operator_cvr: string | null
          operator_org: string | null
          organiser_address: string | null
          organiser_cvr: string | null
          organiser_email: string | null
          organiser_name: string | null
          organiser_phone: string | null
          pack_date: string | null
          pack_down_date: string | null
          prep_status: string | null
          previous_contact_note: string | null
          project_leaders: string | null
          setup_date: string | null
          setup_responsibility: string | null
          slug: string
          start_date: string
          tent_size_overall: string | null
          updated_at: string | null
          website_domain: string | null
          year: number
        }
        Insert: {
          address?: string | null
          breakdown_date?: string | null
          city?: string | null
          confirmation_status?: string | null
          contact_contract_email?: string | null
          contact_contract_name?: string | null
          contact_contract_phone?: string | null
          contact_operations_email?: string | null
          contact_operations_name?: string | null
          contact_operations_phone?: string | null
          country?: string | null
          created_at?: string | null
          end_date: string
          festival_duration_days?: number | null
          id?: string
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          menu_summary?: string | null
          name: string
          notes?: string | null
          operator_cvr?: string | null
          operator_org?: string | null
          organiser_address?: string | null
          organiser_cvr?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          pack_date?: string | null
          pack_down_date?: string | null
          prep_status?: string | null
          previous_contact_note?: string | null
          project_leaders?: string | null
          setup_date?: string | null
          setup_responsibility?: string | null
          slug: string
          start_date: string
          tent_size_overall?: string | null
          updated_at?: string | null
          website_domain?: string | null
          year: number
        }
        Update: {
          address?: string | null
          breakdown_date?: string | null
          city?: string | null
          confirmation_status?: string | null
          contact_contract_email?: string | null
          contact_contract_name?: string | null
          contact_contract_phone?: string | null
          contact_operations_email?: string | null
          contact_operations_name?: string | null
          contact_operations_phone?: string | null
          country?: string | null
          created_at?: string | null
          end_date?: string
          festival_duration_days?: number | null
          id?: string
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          menu_summary?: string | null
          name?: string
          notes?: string | null
          operator_cvr?: string | null
          operator_org?: string | null
          organiser_address?: string | null
          organiser_cvr?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          pack_date?: string | null
          pack_down_date?: string | null
          prep_status?: string | null
          previous_contact_note?: string | null
          project_leaders?: string | null
          setup_date?: string | null
          setup_responsibility?: string | null
          slug?: string
          start_date?: string
          tent_size_overall?: string | null
          updated_at?: string | null
          website_domain?: string | null
          year?: number
        }
        Relationships: []
      }
      finance_rules: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          priority: string
          rule_description: string
          rule_name: string
          source_rule_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          priority: string
          rule_description: string
          rule_name: string
          source_rule_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: string
          rule_description?: string
          rule_name?: string
          source_rule_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ingredient_storage: {
        Row: {
          created_at: string | null
          current_qty: number | null
          current_qty_unit: string | null
          id: string
          ingredient_id: string
          is_primary: boolean | null
          last_stock_check: string | null
          notes: string | null
          storage_location_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_qty?: number | null
          current_qty_unit?: string | null
          id?: string
          ingredient_id: string
          is_primary?: boolean | null
          last_stock_check?: string | null
          notes?: string | null
          storage_location_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_qty?: number | null
          current_qty_unit?: string | null
          id?: string
          ingredient_id?: string
          is_primary?: boolean | null
          last_stock_check?: string | null
          notes?: string | null
          storage_location_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_storage_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_storage_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_storage_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_storage_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_storage_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_storage_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["storage_id"]
          },
        ]
      }
      ingredient_suppliers: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          ingredient_id: string
          is_default: boolean | null
          last_price_update: string | null
          notes: string | null
          pack_size: number | null
          pack_unit: string | null
          supplier_id: string
          supplier_sku: string | null
          unit_price_dkk: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          ingredient_id: string
          is_default?: boolean | null
          last_price_update?: string | null
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          supplier_id: string
          supplier_sku?: string | null
          unit_price_dkk?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          ingredient_id?: string
          is_default?: boolean | null
          last_price_update?: string | null
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          supplier_id?: string
          supplier_sku?: string | null
          unit_price_dkk?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_suppliers_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ingredient_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string | null
          default_supplier_id: string | null
          id: string
          is_active: boolean | null
          manual_qty_reason: string | null
          name: string
          notes: string | null
          pack_size: number | null
          pack_unit: string | null
          requires_manual_qty: boolean | null
          slug: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          manual_qty_reason?: string | null
          name: string
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          requires_manual_qty?: boolean | null
          slug: string
          unit: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          manual_qty_reason?: string | null
          name?: string
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          requires_manual_qty?: boolean | null
          slug?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      intelligence_ingestion: {
        Row: {
          ai_proposed_updates: Json | null
          ai_summary: string | null
          ai_warnings: string[] | null
          application_results: Json | null
          applied_at: string | null
          created_at: string
          error_log: string | null
          file_path: string | null
          hint_card_types: string[] | null
          hint_concept_ids: string[] | null
          hint_festival_id: string | null
          hint_notes: string | null
          human_decision: string | null
          human_edits: Json | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          id: string
          parse_confidence: number | null
          parse_duration_ms: number | null
          parse_input_tokens: number | null
          parse_model: string | null
          parse_output_tokens: number | null
          parsed_at: string | null
          preview_image_path: string | null
          raw_content: string | null
          resulted_in_accommodation_updates: string[] | null
          resulted_in_action_items: string[] | null
          resulted_in_contact_updates: string[] | null
          resulted_in_contract_updates: string[] | null
          resulted_in_facade_updates: string[] | null
          resulted_in_questions: string[] | null
          resulted_in_safety_updates: string[] | null
          resulted_in_timeline_events: string[] | null
          source_filename: string | null
          source_received_at: string | null
          source_sender: string | null
          source_subject: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_proposed_updates?: Json | null
          ai_summary?: string | null
          ai_warnings?: string[] | null
          application_results?: Json | null
          applied_at?: string | null
          created_at?: string
          error_log?: string | null
          file_path?: string | null
          hint_card_types?: string[] | null
          hint_concept_ids?: string[] | null
          hint_festival_id?: string | null
          hint_notes?: string | null
          human_decision?: string | null
          human_edits?: Json | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          parse_confidence?: number | null
          parse_duration_ms?: number | null
          parse_input_tokens?: number | null
          parse_model?: string | null
          parse_output_tokens?: number | null
          parsed_at?: string | null
          preview_image_path?: string | null
          raw_content?: string | null
          resulted_in_accommodation_updates?: string[] | null
          resulted_in_action_items?: string[] | null
          resulted_in_contact_updates?: string[] | null
          resulted_in_contract_updates?: string[] | null
          resulted_in_facade_updates?: string[] | null
          resulted_in_questions?: string[] | null
          resulted_in_safety_updates?: string[] | null
          resulted_in_timeline_events?: string[] | null
          source_filename?: string | null
          source_received_at?: string | null
          source_sender?: string | null
          source_subject?: string | null
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_proposed_updates?: Json | null
          ai_summary?: string | null
          ai_warnings?: string[] | null
          application_results?: Json | null
          applied_at?: string | null
          created_at?: string
          error_log?: string | null
          file_path?: string | null
          hint_card_types?: string[] | null
          hint_concept_ids?: string[] | null
          hint_festival_id?: string | null
          hint_notes?: string | null
          human_decision?: string | null
          human_edits?: Json | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          parse_confidence?: number | null
          parse_duration_ms?: number | null
          parse_input_tokens?: number | null
          parse_model?: string | null
          parse_output_tokens?: number | null
          parsed_at?: string | null
          preview_image_path?: string | null
          raw_content?: string | null
          resulted_in_accommodation_updates?: string[] | null
          resulted_in_action_items?: string[] | null
          resulted_in_contact_updates?: string[] | null
          resulted_in_contract_updates?: string[] | null
          resulted_in_facade_updates?: string[] | null
          resulted_in_questions?: string[] | null
          resulted_in_safety_updates?: string[] | null
          resulted_in_timeline_events?: string[] | null
          source_filename?: string | null
          source_received_at?: string | null
          source_sender?: string | null
          source_subject?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "intelligence_ingestion_hint_festival_id_fkey"
            columns: ["hint_festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      personnel_history: {
        Row: {
          created_at: string | null
          email: string | null
          end_date: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: string
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          end_date?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          end_date?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_access_finance: boolean
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          can_access_finance?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          can_access_finance?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          dish_id: string
          id: string
          ingredient_id: string
          notes: string | null
          qty_per_portion: number
          unit: string
        }
        Insert: {
          created_at?: string | null
          dish_id: string
          id?: string
          ingredient_id: string
          notes?: string | null
          qty_per_portion: number
          unit: string
        }
        Update: {
          created_at?: string | null
          dish_id?: string
          id?: string
          ingredient_id?: string
          notes?: string | null
          qty_per_portion?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["ingredient_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["ingredient_id"]
          },
        ]
      }
      season_rentals: {
        Row: {
          accreditation_pdf_path: string | null
          accreditation_uploaded_at: string | null
          bilgruppe: string | null
          capacity: number | null
          contracting_entity: string
          contracting_entity_cvr: string | null
          created_at: string | null
          customer_number: string | null
          daily_rate_dkk: number | null
          display_name: string | null
          end_date: string
          id: string
          insurance_cdi: boolean | null
          insurance_glass: boolean | null
          insurance_pai: boolean | null
          insurance_rsa: boolean | null
          km_included_per_period: number | null
          km_overage_rate_dkk: number | null
          license_plate: string | null
          monthly_rate_dkk: number | null
          monthly_renewal_day: number | null
          notes: string | null
          ownership: string
          pickup_location: string | null
          primary_driver_name: string | null
          reservation_number: string | null
          return_location: string | null
          season_label: string
          selvrisiko_dkk: number | null
          start_date: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          tariff_model: string | null
          updated_at: string | null
          vehicle_type: string
        }
        Insert: {
          accreditation_pdf_path?: string | null
          accreditation_uploaded_at?: string | null
          bilgruppe?: string | null
          capacity?: number | null
          contracting_entity: string
          contracting_entity_cvr?: string | null
          created_at?: string | null
          customer_number?: string | null
          daily_rate_dkk?: number | null
          display_name?: string | null
          end_date: string
          id?: string
          insurance_cdi?: boolean | null
          insurance_glass?: boolean | null
          insurance_pai?: boolean | null
          insurance_rsa?: boolean | null
          km_included_per_period?: number | null
          km_overage_rate_dkk?: number | null
          license_plate?: string | null
          monthly_rate_dkk?: number | null
          monthly_renewal_day?: number | null
          notes?: string | null
          ownership?: string
          pickup_location?: string | null
          primary_driver_name?: string | null
          reservation_number?: string | null
          return_location?: string | null
          season_label: string
          selvrisiko_dkk?: number | null
          start_date: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tariff_model?: string | null
          updated_at?: string | null
          vehicle_type: string
        }
        Update: {
          accreditation_pdf_path?: string | null
          accreditation_uploaded_at?: string | null
          bilgruppe?: string | null
          capacity?: number | null
          contracting_entity?: string
          contracting_entity_cvr?: string | null
          created_at?: string | null
          customer_number?: string | null
          daily_rate_dkk?: number | null
          display_name?: string | null
          end_date?: string
          id?: string
          insurance_cdi?: boolean | null
          insurance_glass?: boolean | null
          insurance_pai?: boolean | null
          insurance_rsa?: boolean | null
          km_included_per_period?: number | null
          km_overage_rate_dkk?: number | null
          license_plate?: string | null
          monthly_rate_dkk?: number | null
          monthly_renewal_day?: number | null
          notes?: string | null
          ownership?: string
          pickup_location?: string | null
          primary_driver_name?: string | null
          reservation_number?: string | null
          return_location?: string | null
          season_label?: string
          selvrisiko_dkk?: number | null
          start_date?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tariff_model?: string | null
          updated_at?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_rentals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rentals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "season_rentals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "season_rentals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "season_rentals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          notes: string | null
          origin: string | null
          phone: string | null
          role_default: string | null
          short_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          role_default?: string | null
          short_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin?: string | null
          phone?: string | null
          role_default?: string | null
          short_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      storage_locations: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          delivers_to_festival: boolean | null
          delivery_notes: string | null
          id: string
          is_active: boolean | null
          location_type: string | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          delivers_to_festival?: boolean | null
          delivery_notes?: string | null
          id?: string
          is_active?: boolean | null
          location_type?: string | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          delivers_to_festival?: boolean | null
          delivery_notes?: string | null
          id?: string
          is_active?: boolean | null
          location_type?: string | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          category: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          id: string
          invoiced_to: string | null
          is_active: boolean | null
          name: string
          notes: string | null
          payment_terms: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          invoiced_to?: string | null
          is_active?: boolean | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          invoiced_to?: string | null
          is_active?: boolean | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transport_leg_assignments: {
        Row: {
          created_at: string | null
          id: string
          leg_id: string
          notes: string | null
          pickup_point: string | null
          role: string
          seat_position: string | null
          staff_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          leg_id: string
          notes?: string | null
          pickup_point?: string | null
          role?: string
          seat_position?: string | null
          staff_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          leg_id?: string
          notes?: string | null
          pickup_point?: string | null
          role?: string
          seat_position?: string | null
          staff_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_leg_assignments_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_leg_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "festival_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_legs: {
        Row: {
          cargo_description: string | null
          created_at: string | null
          destination: string | null
          effective_capacity: number | null
          id: string
          leg_date: string
          leg_label: string
          leg_phase: string
          leg_start_time: string | null
          notes: string | null
          origin: string | null
          status: string
          transport_id: string
          updated_at: string | null
        }
        Insert: {
          cargo_description?: string | null
          created_at?: string | null
          destination?: string | null
          effective_capacity?: number | null
          id?: string
          leg_date: string
          leg_label: string
          leg_phase: string
          leg_start_time?: string | null
          notes?: string | null
          origin?: string | null
          status?: string
          transport_id: string
          updated_at?: string | null
        }
        Update: {
          cargo_description?: string | null
          created_at?: string | null
          destination?: string | null
          effective_capacity?: number | null
          id?: string
          leg_date?: string
          leg_label?: string
          leg_phase?: string
          leg_start_time?: string | null
          notes?: string | null
          origin?: string | null
          status?: string
          transport_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_legs_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: false
            referencedRelation: "festival_transport"
            referencedColumns: ["id"]
          },
        ]
      }
      trolley_items: {
        Row: {
          category: string
          created_at: string | null
          default_storage_location_id: string | null
          default_supplier_id: string | null
          id: string
          is_active: boolean | null
          is_consumable: boolean | null
          name: string
          notes: string | null
          pack_size: number | null
          pack_unit: string | null
          slug: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_storage_location_id?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          is_consumable?: boolean | null
          name: string
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          slug: string
          unit: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_storage_location_id?: string | null
          default_supplier_id?: string | null
          id?: string
          is_active?: boolean | null
          is_consumable?: boolean | null
          name?: string
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
          slug?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trolley_items_default_storage_location_id_fkey"
            columns: ["default_storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trolley_items_default_storage_location_id_fkey"
            columns: ["default_storage_location_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_storage_options"
            referencedColumns: ["storage_id"]
          },
          {
            foreignKeyName: "trolley_items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trolley_items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "trolley_items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["rental_supplier_id"]
          },
          {
            foreignKeyName: "trolley_items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_supplier_options"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "trolley_items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["supplier_id"]
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
      festival_contacts_aggregated: {
        Row: {
          canonical_name: string | null
          contact_type: Database["public"]["Enums"]["contact_type"] | null
          dedup_key: string | null
          email: string | null
          festival_count: number | null
          festival_ids: string[] | null
          festival_names: string[] | null
          festival_slugs: string[] | null
          is_primary_at_any: boolean | null
          notes_combined: string | null
          organization: string | null
          phone: string | null
          role: string | null
        }
        Relationships: []
      }
      v_attention_items: {
        Row: {
          concept_id: string | null
          concept_name: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          due_time: string | null
          festival_id: string | null
          festival_name: string | null
          festival_slug: string | null
          festival_start_date: string | null
          owner_name: string | null
          priority: string | null
          source_card_label: string | null
          source_id: string | null
          source_table: string | null
          status: string | null
          title: string | null
          urgency_bucket: string | null
        }
        Relationships: []
      }
      v_attention_summary: {
        Row: {
          festival_id: string | null
          festival_name: string | null
          festival_slug: string | null
          festival_start_date: string | null
          later_count: number | null
          overdue_count: number | null
          this_week_count: number | null
          today_count: number | null
          total_count: number | null
          worst_bucket: string | null
        }
        Relationships: []
      }
      v_consumables_order_by_supplier: {
        Row: {
          festival_id: string | null
          festival_name: string | null
          item_category: string | null
          item_id: string | null
          item_name: string | null
          pack_size: number | null
          pack_unit: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_qty_needed: number | null
          unit: string | null
        }
        Relationships: []
      }
      v_cooking_equipment_rentals: {
        Row: {
          concept_name: string | null
          cost_dkk: number | null
          equipment_name: string | null
          festival_id: string | null
          festival_name: string | null
          notes: string | null
          qty: number | null
          rental_supplier_id: string | null
          rental_supplier_name: string | null
        }
        Relationships: []
      }
      v_festival_kpis: {
        Row: {
          action_items_open: number | null
          action_items_overdue: number | null
          action_items_total: number | null
          concepts_count: number | null
          festival_id: string | null
          festival_name: string | null
          total_bed_nights: number | null
          total_person_hours: number | null
          total_shifts: number | null
          workforce_count: number | null
        }
        Insert: {
          action_items_open?: never
          action_items_overdue?: never
          action_items_total?: never
          concepts_count?: never
          festival_id?: string | null
          festival_name?: string | null
          total_bed_nights?: never
          total_person_hours?: never
          total_shifts?: never
          workforce_count?: never
        }
        Update: {
          action_items_open?: never
          action_items_overdue?: never
          action_items_total?: never
          concepts_count?: never
          festival_id?: string | null
          festival_name?: string | null
          total_bed_nights?: never
          total_person_hours?: never
          total_shifts?: never
          workforce_count?: never
        }
        Relationships: []
      }
      v_festival_next_deadline: {
        Row: {
          consequence: string | null
          deadline_at: string | null
          festival_id: string | null
          is_hard: boolean | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_consumables_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_cooking_equipment_rentals"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_missing_manual_quantities"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_order_by_supplier"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_trolley_pack_list"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      v_grocery_list_by_supplier: {
        Row: {
          estimated_cost_dkk: number | null
          festival_id: string | null
          festival_name: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          pack_size: number | null
          pack_unit: string | null
          requires_manual_qty: boolean | null
          source: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_portions: number | null
          total_qty_needed: number | null
          unit_price_dkk: number | null
        }
        Relationships: []
      }
      v_ingredient_storage_options: {
        Row: {
          current_qty: number | null
          current_qty_unit: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          is_primary: boolean | null
          last_stock_check: string | null
          notes: string | null
          storage_id: string | null
          storage_name: string | null
        }
        Relationships: []
      }
      v_ingredient_supplier_options: {
        Row: {
          ingredient_id: string | null
          ingredient_name: string | null
          is_default: boolean | null
          notes: string | null
          pack_size: number | null
          pack_unit: string | null
          supplier_id: string | null
          supplier_name: string | null
          unit_price_dkk: number | null
        }
        Relationships: []
      }
      v_missing_manual_quantities: {
        Row: {
          festival_id: string | null
          festival_name: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          ingredient_unit: string | null
          manual_qty_reason: string | null
          suggested_supplier: string | null
        }
        Relationships: []
      }
      v_trolley_order_by_supplier: {
        Row: {
          festival_id: string | null
          festival_name: string | null
          item_category: string | null
          item_id: string | null
          item_name: string | null
          pack_size: number | null
          pack_unit: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_qty_needed: number | null
          unit: string | null
        }
        Relationships: []
      }
      v_trolley_pack_list: {
        Row: {
          concept_id: string | null
          concept_name: string | null
          festival_id: string | null
          festival_name: string | null
          is_consumable: boolean | null
          item_category: string | null
          item_name: string | null
          qty: number | null
          source: string | null
          trolley_number: number | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_active_rules_for_festival: {
        Args: { festival_slug: string }
        Returns: Json
      }
      get_dashboard_overview: { Args: never; Returns: Json }
      has_finance_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_attention_done: {
        Args: { p_source_id: string; p_source_table: string }
        Returns: string
      }
      recalculate_invoice_statuses: { Args: never; Returns: undefined }
    }
    Enums: {
      accommodation_payment_status:
        | "not_paid"
        | "deposit_paid"
        | "paid_in_full"
        | "invoiced"
      accommodation_type:
        | "festival_camping"
        | "festival_caravan"
        | "festival_provided_room"
        | "hotel"
        | "airbnb"
        | "private_house"
        | "company_van"
      app_role: "admin" | "member"
      contact_type: "festival_organizer" | "operator" | "internal" | "supplier"
      document_category:
        | "invoice"
        | "festival"
        | "contract"
        | "hr"
        | "supplier"
        | "authority"
        | "other"
      equipment_source: "by_us" | "by_festival"
      equipment_status: "pending" | "confirmed" | "delivered" | "returned"
      safety_electrical_status:
        | "not_required"
        | "pending"
        | "certified"
        | "failed"
      safety_food_status:
        | "not_scheduled"
        | "scheduled"
        | "passed"
        | "passed_with_remarks"
        | "failed"
        | "not_required"
      safety_gas_status:
        | "not_required"
        | "scheduled"
        | "passed"
        | "failed"
        | "pending_reschedule"
      task_priority: "urgent" | "high" | "normal" | "low"
      task_status: "pending" | "in_progress" | "done"
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
      accommodation_payment_status: [
        "not_paid",
        "deposit_paid",
        "paid_in_full",
        "invoiced",
      ],
      accommodation_type: [
        "festival_camping",
        "festival_caravan",
        "festival_provided_room",
        "hotel",
        "airbnb",
        "private_house",
        "company_van",
      ],
      app_role: ["admin", "member"],
      contact_type: ["festival_organizer", "operator", "internal", "supplier"],
      document_category: [
        "invoice",
        "festival",
        "contract",
        "hr",
        "supplier",
        "authority",
        "other",
      ],
      equipment_source: ["by_us", "by_festival"],
      equipment_status: ["pending", "confirmed", "delivered", "returned"],
      safety_electrical_status: [
        "not_required",
        "pending",
        "certified",
        "failed",
      ],
      safety_food_status: [
        "not_scheduled",
        "scheduled",
        "passed",
        "passed_with_remarks",
        "failed",
        "not_required",
      ],
      safety_gas_status: [
        "not_required",
        "scheduled",
        "passed",
        "failed",
        "pending_reschedule",
      ],
      task_priority: ["urgent", "high", "normal", "low"],
      task_status: ["pending", "in_progress", "done"],
    },
  },
} as const
