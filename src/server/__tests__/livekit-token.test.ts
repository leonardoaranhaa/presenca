import { describe, expect, it } from "vitest";
import { createLiveKitAccessToken } from "../livekit-token";

describe("createLiveKitAccessToken", () => {
  it("emite JWT de 3 partes", () => {
    const token = createLiveKitAccessToken({
      apiKey: "devkey",
      apiSecret: "secretsecretsecretsecretsecretsecret",
      identity: "user_1",
      room: "place_casa",
      name: "Ana",
    });
    expect(token.split(".")).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(payload.iss).toBe("devkey");
    expect(payload.sub).toBe("user_1");
    expect(payload.video.room).toBe("place_casa");
    expect(payload.video.roomJoin).toBe(true);
  });
});
