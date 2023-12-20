import Doorbird, {
  Response,
  DoorbirdInfoBHA,
  Scheme,
  DoorbirdOptions,
  SessionBHA,
  BaseBHA,
  Favorites,
  FavoriteType,
  Schedule,
  ScheduleEntry,
  SipStatusBHA,
} from "../src";
import axios, { AxiosRequestConfig } from "axios";

jest.mock("axios");

beforeAll(() => {
  (axios as jest.Mocked<typeof axios>).create.mockReturnThis();
});

const scheme = Scheme.http;
const host = "127.0.0.1";
const username = "username";
const password = "password";

const doorbirdOptions: DoorbirdOptions = {
  scheme: scheme,
  host: host,
  username: username,
  password: password,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResponse = (payload?: any, statusCode = 200) => {
  return {
    status: statusCode,
    data: payload,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requestConfigParam = (data?: any): AxiosRequestConfig => {
  const requestConfig: AxiosRequestConfig = {
  };
  if (data !== undefined) {
    requestConfig.data = data;
  }
  return requestConfig;
};

const uriParam = (path: string): string => {
  return `${scheme}://${host}${path}`;
};

const doorbird = new Doorbird(doorbirdOptions);

describe("Doorbird Client", () => {
  test("initializeSession", (done) => {
    const data: Response<SessionBHA> = {
      BHA: {
        RETURNCODE: "0",
        SESSIONID: "SessionID",
        NOTIFICATION_ENCRYPTION_KEY: "NEK"
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .initializeSession()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/getsession.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("destroySession", (done) => {
    const data: Response<SessionBHA> = {
      BHA: {
        RETURNCODE: "0",
        SESSIONID: "SessionID",
        NOTIFICATION_ENCRYPTION_KEY: "NEK"
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .destroySession("sessionid")
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/getsession.cgi?invalidate=sessionid")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("getInfo", (done) => {
    const data: Response<DoorbirdInfoBHA> = {
      BHA: {
        RETURNCODE: "1",
        VERSION: [
          {
            "DEVICE-TYPE": "DoorBird D2101FV-EK-RAL7016",
            BUILD_NUMBER: "16345668",
            FIRMWARE: "000131",
            RELAYS: ["aigmwa@1"],
            WIFI_MAC_ADDR: "1CCAE373C12C",
          },
        ],
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .getInfo()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/info.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("openDoor", (done) => {
    const data: Response<BaseBHA> = {
      BHA: {
        RETURNCODE: "0",
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .openDoor("relay")
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/open-door.cgi?r=relay")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("lightOn", (done) => {
    const data: Response<BaseBHA> = {
      BHA: {
        RETURNCODE: "0",
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .lightOn()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/light-on.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("listFavorites", (done) => {
    const data: Response<Favorites> = {
      BHA: {
        http: {
          rest0: {
            title: "Rest",
            value: "http://192.168.99.11",
          },
        },
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .listFavorites()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/favorites.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("createFavorite", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .createFavorite(FavoriteType.http, {
        title: "Fav0",
        value: "http://myserver.local/api",
      })
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam(
            "/bha-api/favorites.cgi?action=save&type=http&title=Fav0&value=http%3A%2F%2Fmyserver.local%2Fapi"
          )
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("updateFavorite", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .updateFavorite("Fav0", FavoriteType.http, {
        title: "Fav0",
        value: "http://myserver.local/api",
      })
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam(
            "/bha-api/favorites.cgi?action=save&type=http&title=Fav0&value=http%3A%2F%2Fmyserver.local%2Fapi&id=Fav0"
          )
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("deleteFavorite", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .deleteFavorite("Fav0", FavoriteType.http)
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/favorites.cgi?action=remove&type=http&id=Fav0")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("getSchedule", (done) => {
    const data: Response<Schedule> = {
      BHA: [
        {
          input: "doorbell",
          output: [
            {
              event: "relay",
              schedule: "once",
            },
          ]
        },
      ],
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .getSchedule()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/schedule.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("createScheduleEntry", (done) => {
    const data: ScheduleEntry = {
      input: "doorbell",
      output: [
        {
          event: "relay",
          schedule: "once",
        },
      ]
    };
    (axios.post as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .createScheduleEntry(data)
      .then(() => {
        expect(axios.post).toHaveBeenLastCalledWith(
          uriParam("/bha-api/schedule.cgi"),
          requestConfigParam(data)
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("updateScheduleEntry", (done) => {
    const data: ScheduleEntry = {
      input: "doorbell",
      output: [
        {
          event: "relay",
          schedule: "once",
        },
      ]
    };
    (axios.post as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .updateScheduleEntry(data)
      .then(() => {
        expect(axios.post).toHaveBeenLastCalledWith(
          uriParam("/bha-api/schedule.cgi"),
          requestConfigParam(data)
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("deleteScheduleEntry", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .deleteScheduleEntry("doorbell", null)
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/schedule.cgi?action=remove&input=doorbell")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("deleteScheduleEntry with param", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .deleteScheduleEntry("doorbell", "param0")
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam(
            "/bha-api/schedule.cgi?action=remove&input=doorbell&param=param0"
          )
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("restart", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .restart()
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/restart.cgi")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipRegistration", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .sipRegistration("user0", "password0", "url0")
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam(
            "/bha-api/sip.cgi?action=registration&user=user0&password=password0&url=url0"
          )
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipCall", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .sipCall("url0")
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/sip.cgi?action=makecall&url=url0")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipHangup", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .sipHangup()
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/sip.cgi?action=hangup")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipSettings", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .sipSettings(1, 70, 60, 0, 98127, 0, "user0", 1)
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam(
            "/bha-api/sip.cgi?action=settings&enable=1&mic_volume=70&spk_volume=60&relay1_passcode=98127&incoming_call_user=user0&anc=1"
          )
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipStatus", (done) => {
    const data: Response<SipStatusBHA> = {
      BHA: {
        RETURNCODE: "0",
        SIP: [
          {
            ENABLE: "string",
            PRIORITIZE_APP: "string",
            REGISTER_URL: "string",
            REGISTER_USER: "string",
            REGISTER_AUTH_ID: "string",
            REGISTER_PASSWORD: "string",
            AUTOCALL_MOTIONSENSOR_URL: "string",
            AUTOCALL_DOORBELL_URL: "string",
            SPK_VOLUME: "string",
            MIC_VOLUME: "string",
            DTMF: "string",
            "relais:1": "string",
            "relais:2": "string",
            LIGHT_PASSCODE: "string",
            HANGUP_ON_BUTTON_PRESS: "string",
            INCOMING_CALL_ENABLE: "string",
            INCOMING_CALL_USER: "string",
            ANC: "string",
            LASTERRORCODE: "string",
            LASTERRORTEXT: "string",
            RING_TIME_LIMIT: "string",
            CALL_TIME_LIMIT: "string",
          },
        ],
      },
    };
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(
      mockResponse(data)
    );
    doorbird
      .sipStatus()
      .then((response) => {
        expect(response).toEqual(data);
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/sip.cgi?action=status")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  test("sipSettingsReset", (done) => {
    (axios.get as unknown as jest.Mock).mockResolvedValueOnce(mockResponse());
    doorbird
      .sipSettingsReset()
      .then(() => {
        expect(axios.get).toHaveBeenLastCalledWith(
          uriParam("/bha-api/sip.cgi?action=reset")
        );
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
});
