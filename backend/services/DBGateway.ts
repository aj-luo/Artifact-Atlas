import { createClient, SupabaseClient } from '@supabase/supabase-js';

class DBGateway {
    private static instance: DBGateway;
    private supabase: SupabaseClient;

    private constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Supabase URL and Key must be provided in environment variables.");
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    public static getInstance(): DBGateway {
        if (!DBGateway.instance) {
            DBGateway.instance = new DBGateway();
        }
        return DBGateway.instance;
    }

    public getClient(): SupabaseClient {
        return this.supabase;
    }
}

export const dbGateway = DBGateway.getInstance();
