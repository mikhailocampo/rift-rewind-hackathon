import { RiotAccountResponse, ProfileData, RiotPlatform } from '../types';

export class ProfileDataBuilder {
  private data: Partial<ProfileData> = {};

  static fromRiotAccount(accountData: RiotAccountResponse): ProfileDataBuilder {
    const builder = new ProfileDataBuilder();
    return builder
      .withPuuid(accountData.puuid)
      .withRiotGameName(accountData.gameName)
      .withRiotTagline(accountData.tagLine);
  }

  withPuuid(puuid: string): ProfileDataBuilder {
    this.data.puuid = puuid;
    return this;
  }

  withRiotGameName(gameName: string): ProfileDataBuilder {
    this.data.riot_gamename = gameName;
    return this;
  }

  withRiotTagline(tagline: string): ProfileDataBuilder {
    this.data.riot_tagline = tagline;
    return this;
  }

  withPlatformId(platformId: RiotPlatform | string): ProfileDataBuilder {
    this.data.platform_id = platformId;
    return this;
  }

  withMetadata(meta: Record<string, any>): ProfileDataBuilder {
    this.data.meta = { ...this.data.meta, ...meta };
    return this;
  }

  addMetadataField(key: string, value: any): ProfileDataBuilder {
    if (!this.data.meta) {
      this.data.meta = {};
    }
    this.data.meta[key] = value;
    return this;
  }

  build(): ProfileData {
    if (!this.data.puuid || !this.data.riot_gamename || !this.data.riot_tagline) {
      throw new Error('Required fields missing: puuid, riot_gamename, and riot_tagline are required');
    }

    return {
      puuid: this.data.puuid,
      riot_gamename: this.data.riot_gamename,
      riot_tagline: this.data.riot_tagline,
      platform_id: this.data.platform_id || RiotPlatform.NA1,
      meta: this.data.meta || {}
    };
  }

  reset(): ProfileDataBuilder {
    this.data = {};
    return this;
  }
}