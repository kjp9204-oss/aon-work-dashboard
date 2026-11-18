import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { handleAonRequest } from "./aon-api.mjs";

// Private Sites access policy controls workspace membership. Identity is derived
// only from the dispatcher's authenticated headers through the existing helper.
export async function aonRoute(request: Request): Promise<Response> {
  const user = await getChatGPTUser();
  return handleAonRequest(request, { user, getDatabase: () => env.DB });
}
