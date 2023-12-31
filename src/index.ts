import axios, { AxiosInstance, CreateAxiosDefaults } from "axios";
import * as chacha from "chacha-js";
import * as dgram from "dgram";
import * as https from "https";
import libsodium from "libsodium-wrappers-sumo";
import * as tls from "tls";

// Helper to define integer ranges as parameters
type Enumerate<
  N extends number,
  Acc extends number[] = []
> = Acc["length"] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc["length"]]>;
type IntRange<F extends number, T extends number> = Exclude<
  Enumerate<T>,
  Enumerate<F>
>;

/**
 * Identifier of UDP packages (as of documentation)
 */
const udpIdentifier = Buffer.from([0xde, 0xad, 0xbe]);
/**
 * Fixed argon key length (as of documentation)
 */
const argonKeyLength = 32;

/**
 * Utility method to retrieve the Doorstation's self signed certificate in PEM representation.
 * @param host host to retrieve the certificate for
 */
export async function getDoorstationCertificate(host: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const socket = tls.connect(
      {
        host: host,
        port: 443,
        rejectUnauthorized: false,
      },
      () => {
        const peerCert = socket.getPeerCertificate().raw.toString("base64");
        socket.destroy();
        resolve(
          `-----BEGIN CERTIFICATE-----\n${peerCert}\n-----END CERTIFICATE-----`
        );
      }
    );
  });
}

/**
 * Scheme for API communication with the door station.
 */
export enum Scheme {
  http = "http",
  https = "https",
}

/**
 * Options to initialize the Doorbird client.
 */
export interface DoorbirdOptions {
  /**
   * Scheme to connect to the Doorbid Door Station.
   */
  scheme: Scheme;
  /**
   * Host / IP of the Door Station.
   */
  host: string;
  /**
   * Username to access the API.
   */
  username: string;
  /**
   * Password to access the API.
   */
  password: string;
  /**
   * Provide the Doorstation's TLS certificate to avoid general acceptance of self-signed certificates. If you do not
   * provide a certificate, but specifiy 'https' as scheme, the certificate will be loaded from the configured host.
   */
  certificate?: string;
}

/**
 * Generic response wrapper of the Doorbird API.
 */
export interface Response<Type> {
  BHA: Type;
}

/**
 * Basic BHA object for responses.
 */
export interface BaseBHA {
  RETURNCODE: string;
}

/**
 * Specific BHA object for session responses.
 */
export interface SessionBHA extends BaseBHA {
  SESSIONID: string;
  NOTIFICATION_ENCRYPTION_KEY: string;
}

/**
 * Specific BHA object for info responses.
 */
export interface DoorbirdInfoBHA extends BaseBHA {
  VERSION: DoorbirdInfoBHAVersion[];
}

/**
 * Doorbird info object.
 */
export interface DoorbirdInfoBHAVersion {
  FIRMWARE: string;
  BUILD_NUMBER: string;
  WIFI_MAC_ADDR: string;
  RELAYS: string[];
  "DEVICE-TYPE": string;
}

/**
 * Type for Doorbird favorites.
 */
export enum FavoriteType {
  sip = "sip",
  http = "http",
}

/**
 * Doorbird favorites.
 */
export type Favorites = {
  sip?: Favorite;
  http?: Favorite;
};

/**
 * A single Doorbird favorite.
 */
export type Favorite = {
  [id: string]: FavoriteInfo;
};

/**
 * Information on a Doorbird favorite.
 */
export interface FavoriteInfo {
  title: string;
  value: string;
}

/**
 * A schedule is an array of ScheduleEntries.
 */
export type Schedule = ScheduleEntry[];

/**
 * A single entry of a schedule.
 */
export interface ScheduleEntry {
  input: "doorbell" | "motion" | "rfid";
  param?: string;
  output: ScheduleEntryOutput[];
}

/**
 * Output of a schedule entry.
 */
export interface ScheduleEntryOutput {
  event: "notify" | "sip" | "relay" | "http";
  param?: string;
  schedule: "once" | ScheduleEntrySchedule;
}

/**
 * Specific schedule for a schedule entry.
 */
export interface ScheduleEntrySchedule {
  "from-to"?: FromTo[];
  weekdays?: FromTo[];
}

/**
 * Object that defines a timespan.
 */
export interface FromTo {
  from: string;
  to: string;
}

/**
 * Specific BHA for SIP status.
 */
export interface SipStatusBHA extends BaseBHA {
  SIP: SipStatus[];
}

/**
 * SIP status object.
 */
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

/**
 * Event object for doorbell rings.
 */
export interface RingEvent {
  intercomId: string;
  event: string;
  timestamp: Date;
}

/**
 * Event object for motion detection.
 */
export interface MotionEvent {
  intercomId: string;
  timestamp: Date;
}

/**
 * Callback for ring events.
 */
export type RingCallback = (event: RingEvent) => void;
/**
 * Callback for motion events.
 */
export type MotionCallback = (event: MotionEvent) => void;

/**
 * Wrapper class for a UDP socket, that is capable to handle Doorbird's UDP messages.
 */
export class DoorbirdUdpSocket {
  private username: string;
  private password: string;
  private client: Doorbird;
  private suppressBurst: boolean;
  private server: dgram.Socket;
  private lastEventTimestamp = 0;
  private ringListeners: RingCallback[] = [];
  private motionListeners: MotionCallback[] = [];
  private notificationEncryptionKey: Buffer | null = null;

  /**
   * Construct a new DoorbirdUdpSocket
   *
   * @param port Doorbird sends to ports 6524 and 35344.
   * @param username username of the Doorbird user.
   * @param password password of the Doorbird user.
   * @param client the parent instance of the Doorbird api.
   * @param suppressBurst flag to suppress multiple burst messages (callback is only called once)
   */
  constructor(
    port: 6524 | 35344,
    username: string,
    password: string,
    client: Doorbird,
    suppressBurst = false
  ) {
    this.username = username;
    this.password = password;
    this.client = client;
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
    const identifier = msg.subarray(0, 3);
    const version = msg.subarray(3, 4);

    if (udpIdentifier.toString("base64") !== identifier.toString("base64")) {
      return;
    }

    if (this.suppressBurst) {
      const eventTimestamp = new Date().valueOf();
      if (eventTimestamp - this.lastEventTimestamp < 1000) {
        return;
      }
      this.lastEventTimestamp = eventTimestamp;
    }

    let decrypted;
    if (version[0] === 0x01) {
      decrypted = await this.decryptV1(msg);
    } else if (version[0] === 0x02) {
      decrypted = await this.decryptV2(msg);
    } else {
      throw new Error("Unsupported version of UDP package.");
    }

    const intercomId = decrypted.subarray(0, 6);
    const event = decrypted.subarray(6, 14);
    const timestamp = decrypted.subarray(14, 18);

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
  };

  private decryptV1 = async (msg: Buffer) => {
    const opslimit = msg.subarray(4, 8);
    const memlimit = msg.subarray(8, 12);
    const salt = msg.subarray(12, 28);
    const nonce = msg.subarray(28, 36);
    const ciphertext = msg.subarray(36, 70);

    const streched = await this.strech(salt, opslimit, memlimit);
    const decipher = chacha.AeadLegacy(streched, nonce, true);
    return decipher.update(ciphertext);
  };

  private decryptV2 = async (msg: Buffer) => {
    const nonce = msg.subarray(4, 12);
    const ciphertext = msg.subarray(12, 46);

    const decipher = chacha.AeadLegacy(await this.getNotificationEncryptionKey(), nonce, true);
    return decipher.update(ciphertext);
  };

  private getNotificationEncryptionKey = async () => {
    if (this.notificationEncryptionKey === null) {
      this.notificationEncryptionKey = Buffer.from(
        (await this.client.initializeSession()).BHA.NOTIFICATION_ENCRYPTION_KEY,
        "utf-8"
      );
    }
    return this.notificationEncryptionKey;
  };

  /**
   * Register a ring listener.
   *
   * @param listener ring listener
   */
  registerRingListener(listener: RingCallback): void {
    this.ringListeners.push(listener);
  }

  /**
   * Register a motion listner.
   *
   * @param listener motion listener
   */
  registerMotionListener(listener: MotionCallback): void {
    this.motionListeners.push(listener);
  }

  /**
   * Close the UDP socket.
   */
  close(): void {
    if (this.server) {
      this.server.close();
    }
  }
}

/**
 * Doorbird client class.
 */
export default class Doorbird {
  private options: DoorbirdOptions;
  private http: AxiosInstance | undefined;

  /**
   * Construct a Doorbird client.
   *
   * @param options options for the Doorbird client
   */
  constructor(options: DoorbirdOptions) {
    this.options = options;
  }

  /**
   * Initialize a session.
   *
   * @returns session response
   */
  async initializeSession(): Promise<Response<SessionBHA>> {
    const http = await this.getHttp();
    const resp = await http.get<Response<SessionBHA>>(
      this.uri(`/bha-api/getsession.cgi`)
    );
    return resp.data;
  }

  /**
   * Destroy a session.
   *
   * @param session session response or id
   * @returns session response
   */
  async destroySession(
    session: Response<SessionBHA> | string
  ): Promise<Response<SessionBHA>> {
    if ("object" === typeof session) {
      session = session.BHA.SESSIONID;
    }
    const http = await this.getHttp();
    const resp = await http.get<Response<SessionBHA>>(
      this.uri(`/bha-api/getsession.cgi?invalidate=${session}`)
    );
    return resp.data;
  }

  /**
   * Get info of the Doorbird installation.
   *
   * @returns Doorbird info response
   */
  async getInfo(): Promise<Response<DoorbirdInfoBHA>> {
    const http = await this.getHttp();
    const resp = await http.get<Response<DoorbirdInfoBHA>>(
      this.uri(`/bha-api/info.cgi`)
    );
    return resp.data;
  }

  /**
   * Opens a door via a relay of your doorbird system.
   *
   * @deprecated use toggleRelay instead
   * @param relay the relay that opens the door
   * @returns http response of the call
   */
  async openDoor(relay: string): Promise<Response<BaseBHA>> {
    return this.toggleRelay(relay);
  }

  /**
   * Toggle a relay.
   *
   * @param relay the ID of the relay to be toggled
   * @returns base response
   */
  async toggleRelay(relay: string): Promise<Response<BaseBHA>> {
    const http = await this.getHttp();
    const resp = await http.get<Response<BaseBHA>>(
      this.uri(`/bha-api/open-door.cgi?r=${relay}`)
    );
    return resp.data;
  }

  /**
   * Enable the infra red lights of the door station.
   *
   * @returns base response
   */
  async lightOn(): Promise<Response<BaseBHA>> {
    const http = await this.getHttp();
    const resp = await http.get<Response<BaseBHA>>(
      this.uri(`/bha-api/light-on.cgi`)
    );
    return resp.data;
  }

  /**
   * Get a list of favorites.
   *
   * @returns favorites list
   */
  async listFavorites(): Promise<Favorites> {
    const http = await this.getHttp();
    const resp = await http.get<Favorites>(this.uri(`/bha-api/favorites.cgi`));
    return resp.data;
  }

  /**
   * Create a new favorite.
   *
   * @param type new favorite type
   * @param favoriteInfo favorite info
   * @returns empty promise
   */
  createFavorite(
    type: FavoriteType,
    favoriteInfo: FavoriteInfo
  ): Promise<string> {
    return this.doCreateUpdateFavorite(type, favoriteInfo);
  }

  /**
   * Update a favorite.
   *
   * @param id id of the favorite to be updated
   * @param type type of the favorite to be updated
   * @param favoriteInfo new favorite info
   * @returns empty promise
   */
  updateFavorite(
    id: string,
    type: FavoriteType,
    favoriteInfo: FavoriteInfo
  ): Promise<string> {
    return this.doCreateUpdateFavorite(type, favoriteInfo, id);
  }

  private async doCreateUpdateFavorite(
    type: FavoriteType,
    favoriteInfo: FavoriteInfo,
    id?: string
  ): Promise<string> {
    let url = `/bha-api/favorites.cgi?action=save&type=${type}&title=${encodeURIComponent(
      favoriteInfo.title
    )}&value=${encodeURIComponent(favoriteInfo.value)}`;
    if (id) {
      url += `&id=${id}`;
    }
    const http = await this.getHttp();
    const resp = await http.get<void>(this.uri(url));
    return resp.headers['favoriteid'];
  }

  /**
   * Delete a favorite.
   *
   * @param id id of the favorite to be deleted
   * @param type type of the favorite to be deleted
   * @returns empty promise
   */
  async deleteFavorite(id: string, type: FavoriteType): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(
      this.uri(`/bha-api/favorites.cgi?action=remove&type=${type}&id=${id}`)
    );
    return resp.data;
  }

  /**
   * Get the schedule of the Doorbird system.
   *
   * @returns schedule response
   */
  async getSchedule(): Promise<Schedule> {
    const http = await this.getHttp();
    const resp = await http.get<Schedule>(this.uri(`/bha-api/schedule.cgi`));
    return resp.data;
  }

  /**
   * Create a schedule entry.
   *
   * @param scheduleEntry new schedule entry
   * @returns empty promise
   */
  createScheduleEntry(scheduleEntry: ScheduleEntry): Promise<void> {
    return this.updateScheduleEntry(scheduleEntry);
  }

  /**
   * Update a schedule entry.
   *
   * @param scheduleEntry updated schedule entry
   * @returns empty promise
   */
  async updateScheduleEntry(scheduleEntry: ScheduleEntry): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.post<void>(this.uri(`/bha-api/schedule.cgi`), {
      data: scheduleEntry,
    });
    return resp.data;
  }

  /**
   * Delete a schedule entry.
   *
   * @param input input type of the entry to be deleted
   * @param param param of the entry to be deleted
   * @returns empty promise
   */
  async deleteScheduleEntry(
    input: "doorbell" | "motion" | "rfid",
    param: string | null
  ): Promise<void> {
    let url = `/bha-api/schedule.cgi?action=remove&input=${input}`;
    if (param) {
      url += `&param=${param}`;
    }
    const http = await this.getHttp();
    const resp = await http.get<void>(this.uri(url));
    return resp.data;
  }

  /**
   * Restart the door station.
   *
   * @returns empty promise
   */
  async restart(): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(this.uri(`/bha-api/restart.cgi`));
    return resp.data;
  }

  /**
   * Create a SIP registration.
   *
   * @param user user for the sip registration
   * @param password password for the sip registration
   * @param url url for the sip registration
   * @returns empty promise
   */
  async sipRegistration(
    user: string,
    password: string,
    url: string
  ): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(
      this.uri(
        `/bha-api/sip.cgi?action=registration&user=${user}&password=${password}&url=${url}`
      )
    );
    return resp.data;
  }

  /**
   * Initiate a SIP call.
   *
   * @param url url for the SIP call
   * @returns empty promise
   */
  async sipCall(url: string): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(
      this.uri(`/bha-api/sip.cgi?action=makecall&url=${url}`)
    );
    return resp.data;
  }

  /**
   * End a SIP call.
   *
   * @returns empty promise
   */
  async sipHangup(): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(
      this.uri(`/bha-api/sip.cgi?action=hangup`)
    );
    return resp.data;
  }

  /**
   * Update SIP settings.
   *
   * @param enable enable or disable SIP registration after device reboot
   * @param mic_volume microphone volume (1-100)
   * @param spk_volume speaker volume (1-100)
   * @param dtmf enable or disable DTMF support
   * @param relay1_passcode pincode for triggering the door open relay
   * @param incoming_call_enable enable or disable incoming calls
   * @param incoming_call_user Allowed SIP user which will be authenticated for Doorbird
   * @param anc enable or disable acoustic noise cancellation
   * @returns empty promise
   */
  async sipSettings(
    enable: 0 | 1,
    mic_volume: IntRange<1, 100>,
    spk_volume: IntRange<1, 100>,
    dtmf: 0 | 1,
    relay1_passcode: number,
    incoming_call_enable: 0 | 1,
    incoming_call_user: string,
    anc: 0 | 1,
    ringTimeLimit?: IntRange<10, 300>,
    callTimeLimit?: IntRange<30, 300>
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
    if (ringTimeLimit) {
      url += `&ring_time_limit=${ringTimeLimit}`;
    }
    if (callTimeLimit) {
      url += `&call_time_limit=${callTimeLimit}`;
    }
    const http = await this.getHttp();
    const resp = await http.get<void>(this.uri(url));
    return resp.data;
  }

  /**
   * Get the SIP status.
   *
   * @returns Specific BHA for SIP status
   */
  async sipStatus(): Promise<Response<SipStatusBHA>> {
    const http = await this.getHttp();
    const resp = await http.get<Response<SipStatusBHA>>(
      this.uri(`/bha-api/sip.cgi?action=status`)
    );
    return resp.data;
  }

  /**
   * Reset the SIP settings.
   *
   * @returns empty promise
   */
  async sipSettingsReset(): Promise<void> {
    const http = await this.getHttp();
    const resp = await http.get<void>(
      this.uri(`/bha-api/sip.cgi?action=reset`)
    );
    return resp.data;
  }

  /**
   * Start a UDP socket.
   *
   * @param port port to listen on
   * @param suppressBurst suppress multiple UDP messages into a single callback
   * @returns DoorbirdUdpSocket object
   */
  startUdpSocket(port: 6524 | 35344, suppressBurst = false): DoorbirdUdpSocket {
    return new DoorbirdUdpSocket(
      port,
      this.options.username,
      this.options.password,
      this,
      suppressBurst
    );
  }

  /**
   * Get the Doorbird image url.
   *
   * @returns image url
   */
  getImageUrl(): string {
    return (
      `${this.options.scheme}://${this.options.host}/bha-api/image.cgi` +
      `?http-user=${this.options.username}&http-password=${this.options.password}`
    );
  }

  /**
   * Get the current image.
   *
   * @returns buffer with image data
   */
  async getImage(): Promise<Buffer> {
    const http = await this.getHttp();
    const resp = await http.get(this.getImageUrl(), {
      responseType: "arraybuffer",
    });
    return Buffer.from(resp.data, "binary");
  }

  /**
   * Get the Doorbird live audio url.
   *
   * ATTENTION: if you do not provide a session id or object, the URL will contain sensitive credentials.
   *
   * @param session session object or id
   *
   * @returns audio url
   */
  getAudioUrl(session?: SessionBHA | string): string {
    const baseUri = `http://${this.options.host}/bha-api/audio-receive.cgi`;
    if (!session) {
      // Audio stream does not support https.
      return `${baseUri}?http-user=${this.options.username}&http-password=${this.options.password}`;
    }

    if ("object" === typeof session) {
      session = session.SESSIONID;
    }

    // Audio stream does not support https.
    return `${baseUri}?sessionid=${session}`;
  }

  /**
   * Get the Doorbird video url.
   *
   * ATTENTION: if you do not provide a session id or object, the URL will contain sensitive credentials.
   *
   * @param session session object or id
   *
   * @returns video url
   */
  getVideoUrl(session?: SessionBHA | string): string {
    const baseUri = `http://${this.options.host}/bha-api/audio-receive.cgi`;
    if (!session) {
      // Audio stream does not support https.
      return `${baseUri}?http-user=${this.options.username}&http-password=${this.options.password}`;
    }

    if ("object" === typeof session) {
      session = session.SESSIONID;
    }

    // Video stream does not support https.
    return `${baseUri}?sessionid=${session}`;
  }

  private async getHttp(): Promise<AxiosInstance> {
    if (this.http === undefined) {
      const axiosDefaults: CreateAxiosDefaults = {
        headers: {
          Authorization: this.authHeader(),
        },
      };

      if (this.options.scheme === Scheme.https) {
        let certificate;
        if (this.options.certificate) {
          certificate = this.options.certificate;
        } else {
          certificate = await getDoorstationCertificate(this.options.host);
        }
        axiosDefaults.httpsAgent = new https.Agent({
          ca: certificate,
          checkServerIdentity: () => {
            // we cannot check the identity, as the CN of the certifcate will not
            // match the servername (likely a IP address or a network specific DN)
            return undefined;
          },
        });
      }

      this.http = axios.create(axiosDefaults);
    }
    return this.http;
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
