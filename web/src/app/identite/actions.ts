"use server";

import { revalidatePath } from "next/cache";
import { setCurrentIdentity } from "@/server/identity";

export async function switchIdentityAction(formData: FormData): Promise<void> {
  const key = String(formData.get("identity") ?? "");
  await setCurrentIdentity(key);
  revalidatePath("/", "layout");
}
