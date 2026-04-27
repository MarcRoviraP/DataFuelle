import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase env vars")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkSchema() {
  console.log("🔍 Checking profiles table schema...")
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)

  if (error) {
    console.error("❌ Error fetching profiles:", error)
    return
  }

  if (data && data.length > 0) {
    console.log("✅ Columns found:", Object.keys(data[0]))
  } else {
    console.log("⚠️ No data in profiles to infer schema.")
  }
}

checkSchema()
