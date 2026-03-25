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

