import * as _sodium from 'libsodium-wrappers';
import * as chacha from 'chacha-js';
import * as request from 'request';
import * as dgram from 'dgram';

type EmtpyCallback = () => void;
type ErrorCallback = (err: any) => void;
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

type Schedule = ScheduleEntry[];

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

interface ScheduleEntrySchedule {
    'from-to'?: FromTo[],
    weekdays?: FromTo[]
}

interface FromTo {
    from: string,
    to: string
}

interface SipStatusBHA extends BaseBHA {
    SIP: SipStatus[]
}

interface SipStatus {
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

interface RingEvent {
    intercomId: string,
    event: string,
    timestamp: Date
}

interface MotionEvent {
    intercomId: string,
    timestamp: Date
}

type RingCallback = (event: RingEvent) => void;
type MotionCallback = (event: MotionEvent) => void;

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
        request.get(this.uri(`/bha-api/getsession.cgi`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<SessionBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    destroySession(session: Response<SessionBHA> | string, successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback): void {
        if ("object" === typeof session) {
            session = session.BHA.SESSIONID;
        }
        request.get(this.uri(`/bha-api/getsession.cgi?invalidate=${session}`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<SessionBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    getInfo(successCallback: SuccessCallback<Response<DoorbirdInfoBHA>>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/info.cgi`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<DoorbirdInfoBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    openDoor(relay: string, successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/open-door.cgi?r=${relay}`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<BaseBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    lightOn(successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/light-on.cgi`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<BaseBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    listFavorites(successCallback: SuccessCallback<Favorites>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/favorites.cgi`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Favorites = JSON.parse(body);
                successCallback(jsun);
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
        request.get(this.uri(url), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    deleteFavorite(type: FavoriteType, id: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/favorites.cgi?action=remove&type=${type}&id=${id}`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    getSchedule(successCallback: SuccessCallback<Schedule>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/schedule.cgi`), this.requestOptions(),
            (err: any, res: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Schedule = JSON.parse(body);
                successCallback(jsun);
            });
    }

    createScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        this.updateScheduleEntry(scheduleEntry, successCallback, errCallback);
    }

    updateScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.post(`/bha-api/schedule.cgi`, this.requestOptions(scheduleEntry),
            (err: any) => {
                if (err) {
                    errCallback(err);
                    return
                }
                successCallback();
            });
    }

    deleteScheduleEntry(input: 'doorbell' | 'motion' | 'rfid', param: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        let url = `/bha-api/schedule.cgi?action=remove&input=${input}`;
        if (param) {
            url += `&param=${param}`;
        }
        request.get(this.uri(url), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    restart(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/restart.cgi`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    sipRegistration(user: string, password: string, url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/sip.cgi?action=registration&user=${user}&password=${password}&url=${url}`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    sipCall(url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/sip.cgi?action=makecall&url=${url}`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    sipHangup(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/sip.cgi?action=hangup`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
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
        request.get(this.uri(url), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    sipStatus(successCallback: SuccessCallback<Response<SipStatusBHA>>, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/sip.cgi?action=status`), this.requestOptions(),
            (err: any, _: request.Response, body: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                const jsun: Response<SipStatusBHA> = JSON.parse(body);
                successCallback(jsun);
            });
    }

    sipSettingsReset(successCallback: EmtpyCallback, errCallback: ErrorCallback): void {
        request.get(this.uri(`/bha-api/sip.cgi?action=reset`), this.requestOptions(),
            (err: any) => {
                if (err) {
                    errCallback(err)
                    return;
                }
                successCallback();
            });
    }

    private requestOptions(json?: any): request.CoreOptions {
        return {
            json: json,
            headers: {
                Authorization: this.authHeader()
            }
        };
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
