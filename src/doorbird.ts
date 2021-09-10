import * as request from 'request';

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

export default class Doorbird {
    private options: DoorbirdOptions;

    constructor(options: DoorbirdOptions) {
        this.options = options;
    }

    initializeSession(successCallback: SuccessCallback<Response<SessionBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/getsession.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err)
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
            }
            var jsun: Response<SessionBHA> = JSON.parse(body);
            successCallback(jsun);
        })
    }

    getInfo(callback: (err?: any, info?: Response<DoorbirdInfoBHA>) => void) {
        request(this.req(`/bha-api/info.cgi`), (err, res, body) => {
            if (err) {
                callback({ err: err });
            }
            var jsun: Response<DoorbirdInfoBHA> = JSON.parse(body);
            callback({ info: jsun });
        });
    }

    openDoor(relay: string, successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/open-door.cgi?r=${relay}`), (err, res, body) => {
            if (err) {
                errCallback(err);
            }
            var jsun: Response<BaseBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    lightOn(successCallback: SuccessCallback<Response<BaseBHA>>, errCallback: ErrorCallback) {
        request(this.req(`/bha-api/light-on.cgi`), (err, res, body) => {
            if (err) {
                errCallback(err);
            }
            var jsun: Response<BaseBHA> = JSON.parse(body);
            successCallback(jsun);
        });
    }

    listFavorites(successCallback: SuccessCallback<Favorites>)

    private req(path: string, method = 'GET'): request.RequiredUriUrl & request.CoreOptions {
        return {
            url: `${this.baseUri()}${path}`,
            method: method,
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
