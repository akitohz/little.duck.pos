// Backs window.storage with a real Supabase (Postgres) database
// so data is shared and persisted across every phone/device that opens this app.
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "./supabaseConfig";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const TABLE = "posdata";

async function get(key) {
  const { data, error } = await supabase.from(TABLE).select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("key not found: " + key);
  return { key, value: data.value, shared: true };
}

async function set(key, value) {
  const { error } = await supabase.from(TABLE).upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
  return { key, value, shared: true };
}

async function del(key) {
  const { error } = await supabase.from(TABLE).delete().eq("key", key);
  if (error) throw error;
  return { key, deleted: true, shared: true };
}

async function list(prefix) {
  const { data, error } = await supabase.from(TABLE).select("key");
  if (error) throw error;
  const keys = (data || []).map((d) => d.key).filter((k) => !prefix || k.startsWith(prefix));
  return { keys, prefix, shared: true };
}

window.storage = { get, set, delete: del, list };
