# node-doorbird

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
    host: '<Doorbid IP Adress>',
    username: '<Doorbird Username>',
    password: '<Doorbird Password>'
});
```

> HTTPS is not yet supported, as certificates are self-signed.

### Session Management

```typescript
// initialize a session
doorbird.initializeSession(response => {
    let sessionId = response.SESSIONID;
}, err => {
    console.log(err);
});

// destroy a session
doorbird.destroySession(sessionId, response => {
    console.log("Session destroyed.");
}, err => {
    console.log(err);
});
```

### Basic Control

```typescript
// get station info
doorbird.getInfo(response => {
    console.log(response.VERSION["DEVICE-TYPE"]);
}, err => {
    console.log(err);
});

// open door (switch relay)
doorbird.openDoor("1", response => {
    console.log("Door open.");
}, err => {
    console.log(err);
});

// lights on (nightvision)
doorbird.lightOn(response => {
    console.log("Lights switched on.");
}, err => {
    console.log(err);
});

// restart device
doorbird.restart(() => {
    console.log("Doorbird device restarted.");
}, err => {
    console.log(err);
});
```

### Favorite Handling

```typescript
// create favorite
doorbird.createFavorite(FavoriteType.http, {
    title: 'My Favorite',
    value: 'http://anyIp/doorbird'
}, () => {
    console.log("Favorite created.");
}, err => {
    console.log(err);
});

// update favorite
doorbird.createFavorite("favoriteId", FavoriteType.http, {
    title: 'My Favorite',
    value: 'http://anyChangedIp/doorbird'
}, () => {
    console.log("Favorite updated.");
}, err => {
    console.log(err);
});

// delete favorite
doorbird.createFavorite("favoriteId", FavoriteType.http, () => {
    console.log("Favorite deleted.");
}, err => {
    console.log(err);
});
```

### Schedule

```typescript
// get schedule
doorbird.getSchedule(response => {
    console.log("SChedule:", response);
}, err => {
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
}, () => {
    console.log("Schedule entry created.");
}, err => {
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
}, () => {
    console.log("Schedule entry updated.");
}, err => {
    console.log(err);
});

// delete schedule entry
doorbird.deleteScheduleEntry("doorbell", "My Favorite", () => {
    console.log("Schedule entry deleted.");
}, err => {
    console.log(err);
});
```

### SIP

> To be documented. (Already available in the library)

### Image and Video URLs

```typescript
// get image url
let imageUrl = doorbird.getImageUrl();

// get video url
let videoUrl = doorbird.getVideoUrl();
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
