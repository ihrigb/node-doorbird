import libsodium from "libsodium-wrappers";
import * as chacha from "chacha-js";
import * as dgram from "dgram";
import axios, { AxiosRequestConfig } from "axios";

const udpIdentifier = Buffer.from([0xde, 0xad, 0xbe]);
const argonKeyLength = 32;

export enum Scheme {
  http = "http",
  https = "https",
}

export interface DoorbirdOptions {
  scheme: Scheme;
  host: string;
  username: string;
  password: string;
}

export interface Response<Type> {
  BHA: Type;
}

export interface BaseBHA {
  RETURNCODE: string;
}

export interface SessionBHA extends BaseBHA {
  SESSIONID: string;
}

export interface DoorbirdInfoBHA {
  VERSION: DoorbirdInfoBHAVersion[];
}

export interface DoorbirdInfoBHAVersion {
  FIRMWARE: string;
  BUILD_NUMBER: string;
  WIFI_MAC_ADDR: string;
  RELAYS: string[];
  "DEVICE-TYPE": string;
}

export enum FavoriteType {
  sip = "sip",
  http = "http",
}

export type Favorites = {
  sip?: Favorite;
  http?: Favorite;
};

export type Favorite = {
  [id: string]: FavoriteInfo;
};

export interface FavoriteInfo {
  title: string;
  value: string;
}

export type Schedule = ScheduleEntry[];

export interface ScheduleEntry {
  input: "doorbell" | "motion" | "rfid";
  param?: string;
  output: ScheduleEntryOutput;
}

export interface ScheduleEntryOutput {
  event: "notify" | "sip" | "relay" | "http";
  param?: string;
  schedule: "once" | ScheduleEntrySchedule;
}

export interface ScheduleEntrySchedule {
  "from-to"?: FromTo[];
  weekdays?: FromTo[];
}

export interface FromTo {
  from: string;
  to: string;
}

export interface SipStatusBHA extends BaseBHA {
  SIP: SipStatus[];
}

export interface SipStatus {
  ENABLE: string;
  PRIORITIZE_APP: string;
  REGISTER_URL: string;
  REGISTER_USER: string;
  REGISTER_AUTH_ID: string;
  REGISTER_PASSWORD: string;
  AUTOCALL_MOTIONSENSOR_URL: string;
  AUTOCALL_DOORBELL_URL: string;
  SPK_VOLUME: string;
  MIC_VOLUME: string;
  DTMF: string;
  "relais:1": string;
  "relais:2": string;
  LIGHT_PASSCODE: string;
  HANGUP_ON_BUTTON_PRESS: string;
  INCOMING_CALL_ENABLE: string;
  INCOMING_CALL_USER: string;
  ANC: string;
  LASTERRORCODE: string;
  LASTERRORTEXT: string;
  RING_TIME_LIMIT: string;
  CALL_TIME_LIMIT: string;
}

export interface RingEvent {
  intercomId: string;
  event: string;
  timestamp: Date;
}

export interface MotionEvent {
  intercomId: string;
  timestamp: Date;
}

export type RingCallback = (event: RingEvent) => void;
export type MotionCallback = (event: MotionEvent) => void;

export class DoorbirdUdpSocket {
  private username: string;
  private password: string;
  private suppressBurst: boolean;
  private server: dgram.Socket;
  private lastEventTimestamp = 0;
  private ringListeners: RingCallback[] = [];
  private motionListeners: MotionCallback[] = [];

  constructor(
    port: 6524 | 35344,
    username: string,
    password: string,
    suppressBurst = false
  ) {
    this.username = username;
    this.password = password;
    this.suppressBurst = suppressBurst;
    this.server = dgram.createSocket({
      type: "udp4",
      reuseAddr: true,
    });
    this.server.bind(port);
    this.server.on("message", this.onMessage);
  }

  private strech = async (salt: Buffer, opslimit: Buffer, memlimit: Buffer) => {
    await libsodium.ready;
    const sodium = libsodium;
    const streched = Buffer.from(
      sodium.crypto_pwhash(
        argonKeyLength,
        this.password.substring(0, 5),
        salt,
        opslimit.readInt32BE(),
        memlimit.readInt32BE(),
        sodium.crypto_pwhash_ALG_ARGON2I13
      )
    );
    return streched;
  };

  private onMessage = async (msg: Buffer) => {

    const identifier = msg.slice(0, 3);
    const version = msg.slice(3, 4);
    const opslimit = msg.slice(4, 8);
    const memlimit = msg.slice(8, 12);
    const salt = msg.slice(12, 28);
    const nonce = msg.slice(28, 36);
    const ciphertext = msg.slice(36, 70);

    if (udpIdentifier.toString("base64") !== identifier.toString("base64")) {
      return;
    }

    if (version[0] !== 0x01) {
      return;
    }

    if (this.suppressBurst) {
      const eventTimestamp = new Date().valueOf();
      if ((eventTimestamp - this.lastEventTimestamp) < 1000) {
        return;
      }
      this.lastEventTimestamp = eventTimestamp;
    }

    this.strech(salt, opslimit, memlimit).then((streched) => {
      const decipher = chacha.AeadLegacy(streched, nonce, true);
      const result = decipher.update(ciphertext);

      const intercomId = result.slice(0, 6);
      const event = result.slice(6, 14);
      const timestamp = result.slice(14, 18);

      if (this.username.substring(0, 6) !== intercomId.toString("utf-8")) {
        return;
      }

      const date = new Date(0);
      date.setUTCSeconds(timestamp.readInt32BE());

      const trimmedEvent = event.toString("utf-8").trim();

      if ("motion" === trimmedEvent) {
        this.motionListeners.forEach((listener) =>
          listener({
            intercomId: intercomId.toString("utf-8"),
            timestamp: date,
          })
        );
      } else {
        this.ringListeners.forEach((listener) =>
          listener({
            intercomId: intercomId.toString("utf-8"),
            event: trimmedEvent,
            timestamp: date,
          })
        );
      }
    });
  };

  registerRingListener(listener: RingCallback): void {
    this.ringListeners.push(listener);
  }

  registerMotionListener(listener: MotionCallback): void {
    this.motionListeners.push(listener);
  }

  close(): void {
    if (this.server) {
      this.server.close();
    }
  }
}

export default class Doorbird {
  private options: DoorbirdOptions;

  constructor(options: DoorbirdOptions) {
    this.options = options;
  }

  async initializeSession(): Promise<Response<SessionBHA>> {
    const resp = await axios.get<Response<SessionBHA>>(
      this.uri(`/bha-api/getsession.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  async destroySession(
    session: Response<SessionBHA> | string
  ): Promise<Response<SessionBHA>> {
    if ("object" === typeof session) {
      session = session.BHA.SESSIONID;
    }
    const resp = await axios.get<Response<SessionBHA>>(
      this.uri(`/bha-api/getsession.cgi?invalidate=${session}`),
      this.requestConfig()
    );
    return resp.data;
  }

  async getInfo(): Promise<Response<DoorbirdInfoBHA>> {
    const resp = await axios.get<Response<DoorbirdInfoBHA>>(
      this.uri(`/bha-api/info.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  async openDoor(relay: string): Promise<Response<BaseBHA>> {
    const resp = await axios.get<Response<BaseBHA>>(
      this.uri(`/bha-api/open-door.cgi?r=${relay}`),
      this.requestConfig()
    );
    return resp.data;
  }

  async lightOn(): Promise<Response<BaseBHA>> {
    const resp = await axios.get<Response<BaseBHA>>(
      this.uri(`/bha-api/light-on.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  async listFavorites(): Promise<Favorites> {
    const resp = await axios.get<Favorites>(
      this.uri(`/bha-api/favorites.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  createFavorite(
    type: FavoriteType,
    favoriteInfo: FavoriteInfo
  ): Promise<void> {
    return this.doCreateUpdateFavorite(type, favoriteInfo);
  }

  updateFavorite(
    id: string,
    type: FavoriteType,
    favoriteInfo: FavoriteInfo
  ): Promise<void> {
    return this.doCreateUpdateFavorite(type, favoriteInfo, id);
  }

  private async doCreateUpdateFavorite(
    type: FavoriteType,
    favoriteInfo: FavoriteInfo,
    id?: string
  ): Promise<void> {
    let url = `/bha-api/favorites.cgi?action=save&type=${type}&title=&${encodeURIComponent(
      favoriteInfo.title
    )}&value=${encodeURIComponent(favoriteInfo.value)}`;
    if (id) {
      url += `&id=${id}`;
    }
    const resp = await axios.get<void>(this.uri(url), this.requestConfig());
    return resp.data;
  }

  async deleteFavorite(id: string, type: FavoriteType): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(`/bha-api/favorites.cgi?action=remove&type=${type}&id=${id}`),
      this.requestConfig()
    );
    return resp.data;
  }

  async getSchedule(): Promise<Schedule> {
    const resp = await axios.get<Schedule>(
      this.uri(`/bha-api/schedule.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  createScheduleEntry(scheduleEntry: ScheduleEntry): Promise<void> {
    return this.updateScheduleEntry(scheduleEntry);
  }

  async updateScheduleEntry(scheduleEntry: ScheduleEntry): Promise<void> {
    const resp = await axios.post<void>(
      this.uri(`/bha-api/schedule.cgi`),
      this.requestConfig(scheduleEntry)
    );
    return resp.data;
  }

  async deleteScheduleEntry(
    input: "doorbell" | "motion" | "rfid",
    param: string | null
  ): Promise<void> {
    let url = `/bha-api/schedule.cgi?action=remove&input=${input}`;
    if (param) {
      url += `&param=${param}`;
    }
    const resp = await axios.get<void>(this.uri(url), this.requestConfig());
    return resp.data;
  }

  async restart(): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(`/bha-api/restart.cgi`),
      this.requestConfig()
    );
    return resp.data;
  }

  async sipRegistration(
    user: string,
    password: string,
    url: string
  ): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(
        `/bha-api/sip.cgi?action=registration&user=${user}&password=${password}&url=${url}`
      ),
      this.requestConfig()
    );
    return resp.data;
  }

  async sipCall(url: string): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(`/bha-api/sip.cgi?action=makecall&url=${url}`),
      this.requestConfig()
    );
    return resp.data;
  }

  async sipHangup(): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(`/bha-api/sip.cgi?action=hangup`),
      this.requestConfig()
    );
    return resp.data;
  }

  async sipSettings(
    enable: 0 | 1,
    mic_volume: number,
    spk_volume: number,
    dtmf: 0 | 1,
    relay1_passcode: number,
    incoming_call_enable: 0 | 1,
    incoming_call_user: string,
    anc: 0 | 1
  ): Promise<void> {
    let url = `/bha-api/sip.cgi?action=settings`;
    if (enable) {
      url += `&enable=${enable}`;
    }
    if (mic_volume) {
      url += `&mic_volume=${mic_volume}`;
    }
    if (spk_volume) {
      url += `&spk_volume=${spk_volume}`;
    }
    if (dtmf) {
      url += `&dtmf=${dtmf}`;
    }
    if (relay1_passcode) {
      url += `&relay1_passcode=${relay1_passcode}`;
    }
    if (incoming_call_enable) {
      url += `&incoming_call_enable=${incoming_call_enable}`;
    }
    if (incoming_call_user) {
      url += `&incoming_call_user=${incoming_call_user}`;
    }
    if (anc) {
      url += `&anc=${anc}`;
    }
    const resp = await axios.get<void>(this.uri(url), this.requestConfig());
    return resp.data;
  }

  async sipStatus(): Promise<Response<SipStatusBHA>> {
    const resp = await axios.get<Response<SipStatusBHA>>(
      this.uri(`/bha-api/sip.cgi?action=status`),
      this.requestConfig()
    );
    return resp.data;
  }

  async sipSettingsReset(): Promise<void> {
    const resp = await axios.get<void>(
      this.uri(`/bha-api/sip.cgi?action=reset`),
      this.requestConfig()
    );
    return resp.data;
  }

  startUdpSocket(port: 6524 | 35344, suppressBurst = false): DoorbirdUdpSocket {
    return new DoorbirdUdpSocket(
      port,
      this.options.username,
      this.options.password,
      suppressBurst
    );
  }

  getImageUrl(): string {
    return (
      `${this.options.scheme}://${this.options.host}/bha-api/image.cgi` +
      `?http-user=${this.options.username}&http-password=${this.options.password}`
    );
  }

  async getImage(): Promise<Buffer> {
    const resp = await axios.get(this.getImageUrl(), {
      responseType: 'arraybuffer'
    });
    return Buffer.from(resp.data, 'binary');
  }

  getVideoUrl(): string {
    return (
      `${this.options.scheme}://${this.options.host}/bha-api/video.cgi` +
      `?http-user=${this.options.username}&http-password=${this.options.password}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requestConfig(json?: any): AxiosRequestConfig {
    const requestConfig: AxiosRequestConfig = {
      headers: {
        Authorization: this.authHeader(),
      },
    };
    if (json !== undefined) {
      requestConfig.data = json;
    }
    return requestConfig;
  }

  private uri(path: string): string {
    return `${this.baseUri()}${path}`;
  }

  private baseUri(): string {
    return `${this.options.scheme}://${this.options.host}`;
  }

  private authHeader(): string {
    const auth = Buffer.from(
      `${this.options.username}:${this.options.password}`
    ).toString("base64");
    return "Basic " + auth;
  }
}
