import * as _sodium from 'libsodium-wrappers';
import * as chacha from 'chacha-js';
import * as dgram from 'dgram';
import axios, { AxiosRequestConfig } from 'axios';

type EmtpyCallback = () => void;
type ErrorCallback = (err: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
type SuccessCallback<Type> = (obj: Type) => void;

const udpIdentifier = Buffer.from([0xDE, 0xAD, 0xBE]);
const argonKeyLength = 32;

export enum Scheme {
    http = "http",
    https = "https"
}

export interface DoorbirdOptions {
    scheme: Scheme,
    host: string,
    username: string,
    password: string
}

export interface Response<Type> {
    BHA: Type
}

export interface BaseBHA {
    RETURNCODE: string;
}

export interface SessionBHA extends BaseBHA {
    SESSIONID: string
}

export interface DoorbirdInfoBHA {
    VERSION: DoorbirdInfoBHAVersion[]
}

export interface DoorbirdInfoBHAVersion {
    FIRMWARE: string,
    BUILD_NUMBER: string,
    WIFI_MAC_ADDR: string,
    RELAYS: string[],
    "DEVICE-TYPE": string
}

export enum FavoriteType {
    sip = 'sip',
    http = 'http'
}

export type Favorites = {
    sip?: Favorite,
    http?: Favorite
}

export type Favorite = {
    [id: string]: FavoriteInfo
}

export interface FavoriteInfo {
    title: string,
    value: string
}

export type Schedule = ScheduleEntry[];

export interface ScheduleEntry {
    input: 'doorbell' | 'motion' | 'rfid',
    param?: string
    output: ScheduleEntryOutput
}

export interface ScheduleEntryOutput {
    event: 'notify' | 'sip' | 'relay' | 'http',
    param?: string,
    schedule: 'once' | ScheduleEntrySchedule
}

export interface ScheduleEntrySchedule {
    'from-to'?: FromTo[],
    weekdays?: FromTo[]
}

export interface FromTo {
    from: string,
    to: string
}

export interface SipStatusBHA extends BaseBHA {
    SIP: SipStatus[]
}

export interface SipStatus {
    ENABLE: string,
    PRIORITIZE_APP: string,
    REGISTER_URL: string,
    REGISTER_USER: string,
    REGISTER_AUTH_ID: string,
    REGISTER_PASSWORD: string,
    AUTOCALL_MOTIONSENSOR_URL: string,
    AUTOCALL_DOORBELL_URL: string,
    SPK_VOLUME: string,
    MIC_VOLUME: string,
    DTMF: string,
    'relais:1': string,
    'relais:2': string,
    LIGHT_PASSCODE: string,
    HANGUP_ON_BUTTON_PRESS: string,
    INCOMING_CALL_ENABLE: string,
    INCOMING_CALL_USER: string,
    ANC: string,
    LASTERRORCODE: string,
    LASTERRORTEXT: string,
    RING_TIME_LIMIT: string,
    CALL_TIME_LIMIT: string
}

export interface RingEvent {
    intercomId: string,
    event: string,
    timestamp: Date
}

export interface MotionEvent {
    intercomId: string,
    timestamp: Date
}

export type RingCallback = (event: RingEvent) => void;
export type MotionCallback = (event: MotionEvent) => void;

export class DoorbirdUdpSocket {
    private port: number;
    private username: string;
    private password: string;
    private server: dgram.Socket;
    private ringListeners: RingCallback[] = [];
    private motionListeners: MotionCallback[] = [];

    constructor(port: 6524 | 35344, username: string, password: string) {
        this.port = port;
        this.username = username;
        this.password = password;
        this.server = dgram.createSocket({
            type: 'udp4',
            reuseAddr: true
        });
        this.server.bind(port);
        this.server.on('message', this.onMessage);
    }

    private onMessage(msg: Buffer) {
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

        const strech = async () => {
            await _sodium.ready;
            const sodium = _sodium;
            const streched = Buffer.from(sodium.crypto_pwhash(
                argonKeyLength,
                this.password.substring(0, 5),
                salt,
                opslimit.readInt32BE(),
                memlimit.readInt32BE(),
                sodium.crypto_pwhash_ALG_ARGON2I13
            ));
            return streched;
        }

        strech().then(streched => {
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

            if ("motion" === event.toString('utf-8')) {
                this.motionListeners.forEach(listener => listener({
                    intercomId: intercomId.toString('utf-8'),
                    timestamp: date
                }));
            } else {
                this.ringListeners.forEach(listener => listener({
                    intercomId: intercomId.toString('utf-8'),
                    event: event.toString('utf-8'),
                    timestamp: date
                }));
            }
        });
    }

    registerRingListener(listener: RingCallback): void {
        this.ringListeners.push(listener);
    }

    registerMotionListener(listener: MotionCallback): void {
        this.motionListeners.push(listener);
    }

    getPort(): number {
        return this.port;
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

    initializeSession(successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/getsession.cgi`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    destroySession(session: Response<SessionBHA> | string, successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback): void {
        if ("object" === typeof session) {
            session = session.BHA.SESSIONID;
        }
        axios.get(this.uri(`/bha-api/getsession.cgi?invalidate=${session}`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    getInfo(successCallback: SuccessCallback<Response<DoorbirdInfoBHA>>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/info.cgi`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    openDoor(relay: string, successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/open-door.cgi?r=${relay}`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    lightOn(successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/light-on.cgi`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    listFavorites(successCallback: SuccessCallback<Favorites>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/favorites.cgi`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    createFavorite(type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        this.doCreateUpdateFavorite(type, favoriteInfo, successCallback, errCallback);
    }

    updateFavorite(id: string, type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        this.doCreateUpdateFavorite(type, favoriteInfo, successCallback, errCallback, id);
    }

    private doCreateUpdateFavorite(type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback, id?: string): void {
        let url = `/bha-api/favorites.cgi?action=save&type=${type}&title=&${encodeURIComponent(favoriteInfo.title)}&value=${encodeURIComponent(favoriteInfo.value)}`;
        if (id) {
            url += `&id=${id}`;
        }
        axios.get(this.uri(url), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    deleteFavorite(id: string, type: FavoriteType, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/favorites.cgi?action=remove&type=${type}&id=${id}`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    getSchedule(successCallback: SuccessCallback<Schedule>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/schedule.cgi`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    createScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        this.updateScheduleEntry(scheduleEntry, successCallback, errCallback);
    }

    updateScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.post(this.uri(`/bha-api/schedule.cgi`), this.requestConfig(scheduleEntry)).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    deleteScheduleEntry(input: 'doorbell' | 'motion' | 'rfid', param: string | null, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        let url = `/bha-api/schedule.cgi?action=remove&input=${input}`;
        if (param) {
            url += `&param=${param}`;
        }
        axios.get(this.uri(url), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    restart(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/restart.cgi`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipRegistration(user: string, password: string, url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/sip.cgi?action=registration&user=${user}&password=${password}&url=${url}`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipCall(url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/sip.cgi?action=makecall&url=${url}`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipHangup(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/sip.cgi?action=hangup`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipSettings(successCallback: EmtpyCallback, errCallback: ErrorCallback, enable: 0 | 1,
        mic_volume: number, spk_volume: number, dtmf: 0 | 1, relay1_passcode: number,
        incoming_call_enable: 0 | 1, incoming_call_user: string, anc: 0 | 1): void {
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
        axios.get(this.uri(url), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipStatus(successCallback: SuccessCallback<Response<SipStatusBHA>>, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/sip.cgi?action=status`), this.requestConfig()).then(response => {
            successCallback(response.data);
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    sipSettingsReset(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        axios.get(this.uri(`/bha-api/sip.cgi?action=reset`), this.requestConfig()).then(() => {
            successCallback();
        }).catch(err => {
            errCallback(err);
            return;
        });
    }

    private requestConfig(json?: any): AxiosRequestConfig { // eslint-disable-line @typescript-eslint/no-explicit-any
        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Authorization': this.authHeader()
            }
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
        const auth = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
        return 'Basic ' + auth;
    }
}
