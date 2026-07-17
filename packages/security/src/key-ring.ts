import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { generateKey } from "./crypto-services";

export interface ManagedKey {
  readonly version: number;
  readonly material: Buffer;
  readonly createdAt: ISODateString;
}

/**
 * Provider-independent key ring with versioning and rotation. Previous key
 * versions are retained so tokens/data signed with them can still be verified.
 * P1-M04 uses in-memory material; an HSM/KMS provider slots in behind this API.
 */
export class KeyRing {
  private readonly keys = new Map<number, ManagedKey>();
  private version = 0;

  constructor(initialMaterial?: Buffer) {
    this.add(initialMaterial ?? generateKey());
  }

  private add(material: Buffer): ManagedKey {
    const key: ManagedKey = { version: ++this.version, material, createdAt: nowIso() };
    this.keys.set(key.version, key);
    return key;
  }

  /** Rotate to a new current key; previous versions remain for verification. */
  rotate(material?: Buffer): ManagedKey {
    return this.add(material ?? generateKey());
  }

  current(): ManagedKey {
    const key = this.keys.get(this.version);
    if (!key) {
      throw new Error("Key ring is empty");
    }
    return key;
  }

  get(version: number): ManagedKey | undefined {
    return this.keys.get(version);
  }

  versions(): number[] {
    return [...this.keys.keys()];
  }
}
