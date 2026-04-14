export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      accommodations: {
        Row: {
          accommodation_type: string
          address: string | null
          amenities: string[]
          amenities_complete: boolean
          bathroom_count: number | null
          beach_access_or_view: boolean
          bed_count: number | null
          bedroom_count: number | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          id: string
          image_url: string | null
          is_featured: boolean
          location_point: unknown
          max_guest_capacity: number | null
          name: string
          parish: string | null
          pets_allowed: boolean
          pickup_notes: string | null
          price_max_usd: number | null
          price_min_usd: number | null
          smoking_allowed: boolean
          status: string
          suitable_for_children: boolean
          transportation_notes: string | null
          transportation_provided: boolean
          updated_at: string
          vendor_id: string
          wheelchair_accessible: boolean
        }
        Insert: {
          accommodation_type: string
          address?: string | null
          amenities?: string[]
          amenities_complete?: boolean
          bathroom_count?: number | null
          beach_access_or_view?: boolean
          bed_count?: number | null
          bedroom_count?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_featured?: boolean
          location_point?: unknown
          max_guest_capacity?: number | null
          name: string
          parish?: string | null
          pets_allowed?: boolean
          pickup_notes?: string | null
          price_max_usd?: number | null
          price_min_usd?: number | null
          smoking_allowed?: boolean
          status?: string
          suitable_for_children?: boolean
          transportation_notes?: string | null
          transportation_provided?: boolean
          updated_at?: string
          vendor_id: string
          wheelchair_accessible?: boolean
        }
        Update: {
          accommodation_type?: string
          address?: string | null
          amenities?: string[]
          amenities_complete?: boolean
          bathroom_count?: number | null
          beach_access_or_view?: boolean
          bed_count?: number | null
          bedroom_count?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_featured?: boolean
          location_point?: unknown
          max_guest_capacity?: number | null
          name?: string
          parish?: string | null
          pets_allowed?: boolean
          pickup_notes?: string | null
          price_max_usd?: number | null
          price_min_usd?: number | null
          smoking_allowed?: boolean
          status?: string
          suitable_for_children?: boolean
          transportation_notes?: string | null
          transportation_provided?: boolean
          updated_at?: string
          vendor_id?: string
          wheelchair_accessible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "accommodations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_hours: number | null
          id: string
          image_url: string | null
          is_featured: boolean
          location: string | null
          location_point: unknown
          max_capacity: number | null
          price_per_person: number | null
          rating: number | null
          status: string
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          location?: string | null
          location_point?: unknown
          max_capacity?: number | null
          price_per_person?: number | null
          rating?: number | null
          status?: string
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          location?: string | null
          location_point?: unknown
          max_capacity?: number | null
          price_per_person?: number | null
          rating?: number | null
          status?: string
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_bookings: {
        Row: {
          activity_id: string
          created_at: string
          discount_cents: number
          expires_at: string | null
          id: string
          order_id: string | null
          participants: number
          slot_id: string
          status: string
          subtotal_cents: number
          total_cents: number
          unit_price_cents: number
          updated_at: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          discount_cents?: number
          expires_at?: string | null
          id?: string
          order_id?: string | null
          participants: number
          slot_id: string
          status?: string
          subtotal_cents: number
          total_cents: number
          unit_price_cents: number
          updated_at?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          discount_cents?: number
          expires_at?: string | null
          id?: string
          order_id?: string | null
          participants?: number
          slot_id?: string
          status?: string
          subtotal_cents?: number
          total_cents?: number
          unit_price_cents?: number
          updated_at?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_bookings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_bookings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          activity_id: string
          created_at: string
          ends_at: string
          id: string
          is_cancelled: boolean
          max_capacity: number
          starts_at: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_cancelled?: boolean
          max_capacity: number
          starts_at: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_cancelled?: boolean
          max_capacity?: number
          starts_at?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_lines: {
        Row: {
          accommodation_id: string | null
          check_in: string | null
          check_out: string | null
          created_at: string
          guests: number | null
          id: string
          line_discount_cents: number
          line_subtotal_cents: number
          line_total_cents: number
          line_type: string
          participants: number | null
          slot_id: string | null
          unit_price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accommodation_id?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          guests?: number | null
          id?: string
          line_discount_cents?: number
          line_subtotal_cents: number
          line_total_cents: number
          line_type: string
          participants?: number | null
          slot_id?: string | null
          unit_price_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          guests?: number | null
          id?: string
          line_discount_cents?: number
          line_subtotal_cents?: number
          line_total_cents?: number
          line_type?: string
          participants?: number | null
          slot_id?: string | null
          unit_price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_lines_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_lines_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          discount_cents: number
          id: string
          status: string
          stripe_approval_payment_intent_id: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_setup_intent_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          discount_cents?: number
          id?: string
          status?: string
          stripe_approval_payment_intent_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_setup_intent_id?: string | null
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          discount_cents?: number
          id?: string
          status?: string
          stripe_approval_payment_intent_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_setup_intent_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          processed_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          business_phone: string | null
          business_registration_number: string | null
          contact_email: string | null
          country_of_incorporation: string | null
          created_at: string
          id: string
          is_incorporated: boolean | null
          name: string
          owner_full_name: string | null
          owner_user_id: string
          personal_phone: string | null
          updated_at: string
        }
        Insert: {
          business_phone?: string | null
          business_registration_number?: string | null
          contact_email?: string | null
          country_of_incorporation?: string | null
          created_at?: string
          id?: string
          is_incorporated?: boolean | null
          name: string
          owner_full_name?: string | null
          owner_user_id: string
          personal_phone?: string | null
          updated_at?: string
        }
        Update: {
          business_phone?: string | null
          business_registration_number?: string | null
          contact_email?: string | null
          country_of_incorporation?: string | null
          created_at?: string
          id?: string
          is_incorporated?: boolean | null
          name?: string
          owner_full_name?: string | null
          owner_user_id?: string
          personal_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_activity_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      },
      cancel_activity_bookings_for_order: {
        Args: { p_order_id: string }
        Returns: undefined
      },
      create_activity_booking_after_payment: {
        Args: {
          p_activity_id: string
          p_discount_cents?: number
          p_expires_at?: string | null
          p_order_id: string
          p_participants: number
          p_slot_id: string
          p_status?: string
          p_subtotal_cents: number
          p_total_cents: number
          p_unit_price_cents: number
          p_user_id: string
          p_vendor_id: string
        }
        Returns: Database["public"]["Tables"]["activity_bookings"]["Row"]
      },
      decline_activity_bookings_for_order: {
        Args: { p_order_id: string }
        Returns: undefined
      },
      expire_pending_activity_bookings: {
        Args: never
        Returns: number
      },
      is_site_admin: { Args: never; Returns: boolean }
      is_vendor_owner: { Args: { v_id: string }; Returns: boolean }
      is_vendor_user: { Args: never; Returns: boolean }
      set_accommodation_location_point: {
        Args: { p_accommodation_id: string; p_lat?: number; p_lng?: number }
        Returns: undefined
      }
      set_activity_location_point: {
        Args: { p_activity_id: string; p_lat?: number; p_lng?: number }
        Returns: undefined
      }
      vendor_id_for_user: { Args: never; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

