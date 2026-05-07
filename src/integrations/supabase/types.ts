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
      bc_trolley_templates: {
        Row: {
          category: string
          concept_id: string
          created_at: string | null
          id: string
          item_name: string
          notes: string | null
          qty: number | null
          trolley_number: number
          unit: string | null
        }
        Insert: {
          category: string
          concept_id: string
          created_at?: string | null
          id?: string
          item_name: string
          notes?: string | null
          qty?: number | null
          trolley_number: number
          unit?: string | null
        }
        Update: {
          category?: string
          concept_id?: string
          created_at?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          qty?: number | null
          trolley_number?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bc_trolley_templates_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          color_hex: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          short_name: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          short_name?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          short_name?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
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
          power_amps: number | null
          power_type: string | null
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
          power_amps?: number | null
          power_type?: string | null
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
          power_amps?: number | null
          power_type?: string | null
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
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      festival_action_items: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          festival_id: string
          id: string
          notes: string | null
          owner: string | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_action_items_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_bc_trolleys: {
        Row: {
          concept_id: string
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          status: string | null
          trolley_number: number
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          status?: string | null
          trolley_number: number
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          status?: string | null
          trolley_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "festival_bc_trolleys_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_bc_trolleys_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_bc_trolleys_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_bc_trolleys_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_concepts: {
        Row: {
          concept_id: string
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          stall_name: string | null
          zone: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          stall_name?: string | null
          zone?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          stall_name?: string | null
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_concepts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_cooling: {
        Row: {
          cost_dkk: number | null
          created_at: string | null
          delivery_date: string | null
          festival_id: string
          id: string
          notes: string | null
          payment_due: string | null
          payment_status: string | null
          pickup_date: string | null
          supplier_id: string | null
          supplier_ref: string | null
          unit_type: string
          updated_at: string | null
        }
        Insert: {
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          payment_due?: string | null
          payment_status?: string | null
          pickup_date?: string | null
          supplier_id?: string | null
          supplier_ref?: string | null
          unit_type: string
          updated_at?: string | null
        }
        Update: {
          cost_dkk?: number | null
          created_at?: string | null
          delivery_date?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          payment_due?: string | null
          payment_status?: string | null
          pickup_date?: string | null
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_cooling_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
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
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["supplier_id"]
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_equipment: {
        Row: {
          concept_id: string | null
          created_at: string | null
          equipment_id: string
          festival_id: string
          id: string
          notes: string | null
          qty: number
          zone: string | null
        }
        Insert: {
          concept_id?: string | null
          created_at?: string | null
          equipment_id: string
          festival_id: string
          id?: string
          notes?: string | null
          qty?: number
          zone?: string | null
        }
        Update: {
          concept_id?: string | null
          created_at?: string | null
          equipment_id?: string
          festival_id?: string
          id?: string
          notes?: string | null
          qty?: number
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_equipment_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_facade: {
        Row: {
          concept_id: string
          created_at: string | null
          festival_id: string
          id: string
          notes: string | null
          print_deadline: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          concept_id: string
          created_at?: string | null
          festival_id: string
          id?: string
          notes?: string | null
          print_deadline?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          concept_id?: string
          created_at?: string | null
          festival_id?: string
          id?: string
          notes?: string | null
          print_deadline?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_facade_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_facade_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_facade_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_facade_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_forecasts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_logistics: {
        Row: {
          cost_dkk: number | null
          created_at: string | null
          description: string | null
          end_date: string | null
          festival_id: string
          id: string
          name: string
          notes: string | null
          start_date: string | null
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          cost_dkk?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          festival_id: string
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          cost_dkk?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          festival_id?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_logistics_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_logistics_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_logistics_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_safety: {
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_safety_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      festival_shifts: {
        Row: {
          concept_id: string | null
          created_at: string | null
          end_time: string
          festival_id: string
          hours: number | null
          id: string
          notes: string | null
          role: string | null
          shift_date: string
          staff_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          concept_id?: string | null
          created_at?: string | null
          end_time: string
          festival_id: string
          hours?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          shift_date: string
          staff_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          concept_id?: string | null
          created_at?: string | null
          end_time?: string
          festival_id?: string
          hours?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          shift_date?: string
          staff_id?: string
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_shifts_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
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
      festivals: {
        Row: {
          address: string | null
          breakdown_date: string | null
          city: string | null
          country: string | null
          created_at: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organiser_email: string | null
          organiser_name: string | null
          organiser_phone: string | null
          setup_date: string | null
          slug: string
          start_date: string
          updated_at: string | null
          year: number
        }
        Insert: {
          address?: string | null
          breakdown_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          setup_date?: string | null
          slug: string
          start_date: string
          updated_at?: string | null
          year: number
        }
        Update: {
          address?: string | null
          breakdown_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_phone?: string | null
          setup_date?: string | null
          slug?: string
          start_date?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string | null
          default_supplier_id: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          pack_size: number | null
          pack_unit: string | null
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
          name: string
          notes?: string | null
          pack_size?: number | null
          pack_unit?: string | null
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
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
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
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["ingredient_id"]
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
      suppliers: {
        Row: {
          category: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
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
      v_festival_kpis: {
        Row: {
          action_items_open: number | null
          action_items_overdue: number | null
          action_items_total: number | null
          concepts_count: number | null
          festival_id: string | null
          festival_name: string | null
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
            referencedRelation: "v_festival_kpis"
            referencedColumns: ["festival_id"]
          },
          {
            foreignKeyName: "festival_deadlines_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "v_grocery_list_by_supplier"
            referencedColumns: ["festival_id"]
          },
        ]
      }
      v_grocery_list_by_supplier: {
        Row: {
          festival_id: string | null
          festival_name: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          ingredient_unit: string | null
          pack_size: number | null
          pack_unit: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_portions: number | null
          total_qty_needed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalculate_invoice_statuses: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
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
      task_priority: ["urgent", "high", "normal", "low"],
      task_status: ["pending", "in_progress", "done"],
    },
  },
} as const
