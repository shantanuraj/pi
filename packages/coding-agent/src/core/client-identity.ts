import type { ClientIdentity } from "@earendil-works/pi-ai";
import { VERSION } from "../config.ts";

/** Identify pi's version in the User-Agent without sending provider attribution headers. */
export function getClientIdentity(): ClientIdentity {
	return {
		userAgent: "detailed",
		version: VERSION,
		attribution: null,
	};
}
