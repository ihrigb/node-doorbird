# node-doorbird

[![](https://img.shields.io/npm/v/doorbird.svg)](https://www.npmjs.com/package/doorbird)
[![Apache 2.0 License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/ihrigb/node-doorbird/blob/master/LICENSE)

This is a NodeJS library to interact with Doorbird Door Stations, based on their API.

## Disclaimer

As this library potentially interacts with devices that are integrated in the security of the building, I want you to be aware of the fact, that you are using it at your own risk. I cannot be held responsible for any damage that occurs by the usage of this library.

## Installation

```bash
npm i doorbird
```

## Usage

### Prerequisites

In order to use Doorbird's HTTP API, you need a user with privileges to use the API. For specific things, such as live view, open doors, there are dedicated privilates you have to grant to the user, if needed.

### Client Initialization

```typescript
let doorbird = new Doorbird({
    scheme: Scheme.http, // or https
    host: '<Doorbid IP Address>',
    username: '<Doorbird Username>',
    password: '<Doorbird Password>',
    certificate: '<certificate in pem format>' // can be omitted and is then loaded from the host
});
```

### Session Management

```typescript
// initialize a session
doorbird.initializeSession().then(response => {
    let sessionId = response.SESSIONID;
}).catch(err => {
    console.log(err);
});

// destroy a session
doorbird.destroySession().then(response => {
    console.log("Session destroyed.");
}).catch(err => {
    console.log(err);
});
```

### Basic Control

```typescript
// get station info
doorbird.getInfo().then(response => {
    console.log(response.VERSION["DEVICE-TYPE"]);
}).catch(err => {
    console.log(err);
});

// open door (switch relay)
doorbird.openDoor("1").then(response => {
    console.log("Door open.");
}).catch(err => {
    console.log(err);
});

// lights on (nightvision)
doorbird.lightOn().then(response => {
    console.log("Lights switched on.");
}).catch(err => {
    console.log(err);
});

// restart device
doorbird.restart().then(() => {
    console.log("Doorbird device restarted.");
}.catch(err => {
    console.log(err);
});
```

### Favorite Handling

```typescript
// list favorites
doorbird.listFavorites().then(response => {
    console.log("Favorites:", response);
}).catch(err => {
    console.log(err);
});

// create favorite
doorbird.createFavorite(FavoriteType.http, {
    title: 'My Favorite',
    value: 'http://anyIp/doorbird'
}).then(() => {
    console.log("Favorite created.");
}).catch(err => {
    console.log(err);
});

// update favorite
doorbird.createFavorite("favoriteId", FavoriteType.http, {
    title: 'My Favorite',
    value: 'http://anyChangedIp/doorbird'
}).then(() => {
    console.log("Favorite updated.");
}).catch(err => {
    console.log(err);
});

// delete favorite
doorbird.createFavorite("favoriteId", FavoriteType.http).then(() => {
    console.log("Favorite deleted.");
}).catch(err => {
    console.log(err);
});
```

### Schedule

```typescript
// get schedule
doorbird.getSchedule().then(response => {
    console.log("Schedule:", response);
}).catch(err => {
    console.log(err);
});

// create schedule entry
doorbird.createScheduleEntry({
    input: 'doorbell',
    output: {
        event: 'http',
        param: 'My Favorite',
        schedule: 'once'
    }
}).then(() => {
    console.log("Schedule entry created.");
}).catch(err => {
    console.log(err);
});

// update schedule entry
doorbird.updateScheduleEntry({
    input: 'doorbell',
    output: {
        event: 'http',
        param: 'My Favorite',
        schedule: 'once'
    }
}).then(() => {
    console.log("Schedule entry updated.");
}).catch(err => {
    console.log(err);
});

// delete schedule entry
doorbird.deleteScheduleEntry("doorbell", "My Favorite").then(() => {
    console.log("Schedule entry deleted.");
}).catch(err => {
    console.log(err);
});
```

### SIP

> To be documented. (Already available in the library)

### Image, Audio and Video URLs

```typescript
// get image url
let imageUrl = doorbird.getImageUrl();

// get audio url
let audioUrl = doorbird.getAudioUrl(sessionId)

// get video url
let videoUrl = doorbird.getVideoUrl(sessionId);
```

### dgram UDP Socket for Ring and Motion Events

```typescript
// initialize dgram UDP socket
let doorbirdUdpSocket = doorbird.startUdpSocket(6524);

// register a listener for ring events
doorbirdUdpSocket.registerRingListener(ringEvent => {
    console.log("IntercomId:", ringEvent.intercomId);
    console.log("Event:", ringEvent.event);
    console.log("Time:", ringEvent.timestamp);
});

// register a listener for motion events
doorbirdUdpSocket.registerMotionListener(motionEvent => {
    console.log("IntercomId:", motionEvent.intercomId);
    console.log("Time:", motionEvent.timestamp);
});

// close dgram UDP socket
doorbirdUdpSocket.close();
```

## Doorbird API

Revision: 0.36
Date: November 13th 2023
https://www.doorbird.com/downloads/api_lan.pdf?rev=0.36
