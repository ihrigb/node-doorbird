import * as request from 'request';

type EmtpyCallback = () => void;
type ErrorCallback = (err: any) => void;
type SuccessCallback<Type> = (obj: Type) => void;

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

export default class Doorbird {
    private options: DoorbirdOptions;

    constructor(options: DoorbirdOptions) {
        this.options = options;
    }

    initializeSession(successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/getsession.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err)
                return;
            }
            var jsun: Response<SessionBHA> = JSON.parse(body);
            successCallback(jsun);
        })
    }

    destroySession(session: Response<SessionBHA> | string, successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback) {
        if ("object" === typeof session) {
            session = session.BHA.SESSIONID;
        }

        request(this.req(`/bha-api/getsession.cgi?invalidate=${session}`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Response<SessionBHA> = JSON.parse(body);
            successCallback(jsun);
        })
    }

    getInfo(successCallback: SuccessCallback<Response<DoorbirdInfoBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/info.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Response<DoorbirdInfoBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    openDoor(relay: string, successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/open-door.cgi?r=${relay}`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Response<BaseBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    lightOn(successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/light-on.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Response<BaseBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    listFavorites(successCallback: SuccessCallback<Favorites>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/favorites.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Favorites = JSON.parse(body);
            successCallback(jsun);
        })
    }

    createFavorite(type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        this.doCreateUpdateFavorite(type, favoriteInfo, successCallback, errCallback);
    }

    updateFavorite(id: string, type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        this.doCreateUpdateFavorite(type, favoriteInfo, successCallback, errCallback, id);
    }

    private doCreateUpdateFavorite(type: FavoriteType, favoriteInfo: FavoriteInfo, successCallback: EmtpyCallback, errCallback: ErrorCallback, id?: string) {
        var url = `/bha-api/favorites.cgi?action=save&type=${type}&title=&${encodeURIComponent(favoriteInfo.title)}&value=${encodeURIComponent(favoriteInfo.value)}`;
        if (id) {
            url += `&id=${id}`;
        }
        request(this.req(url), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    deleteFavorite(type: FavoriteType, id: string, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/favorites.cgi?action=remove&type=${type}&id=${id}`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    getSchedule(successCallback: SuccessCallback<Schedule>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/schedule.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Schedule = JSON.parse(body);
            successCallback(jsun);
        })
    }

    createScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        this.updateScheduleEntry(scheduleEntry, successCallback, errCallback);
    }

    updateScheduleEntry(scheduleEntry: ScheduleEntry, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/schedule.cgi`, 'POST', scheduleEntry), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    deleteScheduleEntry(input: 'doorbell' | 'motion' | 'rfid', param: string, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        var url = `/bha-api/schedule.cgi?action=remove&input=${input}`;
        if (param) {
            url += `&param=${param}`;
        }
        request(this.req(url), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    restart(successCallback: () => void, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/restart.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    sipRegistration(user: string, password: string, url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/sip.cgi?action=registration&user=${user}&password=${password}&url=${url}`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    sipCall(url: string, successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/sip.cgi?action=makecall&url=${url}`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    sipHangup(successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/sip.cgi?action=hangup`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    sipSettings(successCallback: EmtpyCallback, errCallback: ErrorCallback, enable: 0 | 1,
        mic_volume: number, spk_volume: number, dtmf: 0 | 1, relay1_passcode: number,
        incoming_call_enable: 0 | 1, incoming_call_user: string, anc: 0 | 1) {
        var url = `/bha-api/sip.cgi?action=settings`;
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
        request(this.req(url), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    sipStatus(successCallback: SuccessCallback<Response<SipStatusBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/sip.cgi?action=status`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            var jsun: Response<SipStatusBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    sipSettingsReset(successCallback: EmtpyCallback, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/sip.cgi?action=reset`), (err, res, body) => {
            if (err) {
                errCallback(err);
                return;
            }
            successCallback();
        });
    }

    private req(path: string, method = 'GET', json?: any): request.RequiredUriUrl & request.CoreOptions {
        return {
            url: `${this.baseUri()}${path}`,
            method: method,
            json: json,
            headers: {
                Authorization: this.authHeader()
            }
        };
    }

    private baseUri(): string {
        return `${this.options.scheme}://${this.options.host}`;
    }

    private authHeader(): string {
        var auth = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
        return 'Basic ' + auth;
    }
}
