// client can implement the eventhandlers:
// * onconnect    => to be notified when it is connected to the STOMP server
// * ondisconnect => to be notified when it is disconnected from the STOMP server
// * onreceive    => to receive STOMP messages
// * onreceipt    => to receive STOMP receipts
// * onerror      => to receive STOMP errors
//
// client can also define a debug(str) handler to display debug infos

(function(window) {
  
  var Stomp = {};

  // TODO frame function should not be exposed once we can really talk to a Stomp server
  Stomp.frame = function(command, headers, body) {
    return {
      command: command,
      headers: headers,
      body: body,
      toString: function() {
        var out = command + '\n';
        if (headers) {
          for (header in headers) {
            if(headers.hasOwnProperty(header)) {
              out = out + header + ': ' + headers[header] + '\n';
            }
          }
        }
        out = out + '\n';
        if (body) {
          out = out + body;
        }
        return out;
      }
    }
  };

  trim = function(str) {
    return str.replace(/^\s+/g,'').replace(/\s+$/g,'');
  }

  Stomp.unmarshall = function(data) {
    var command, headers, body;
    var lines = data.split('\n');
    command = lines[0];
    headers = {};
    var pos;
    for (pos = 1; pos < lines.length ; pos++) {
      if (lines[pos] === '') {
        break;
      }
      var pair = lines[pos].split(':');
      headers[trim(pair[0])] = trim(pair[1]);
    }
    pos++;
    if(lines[pos] === '') {
      // no body
    } else {
      body = "";
      for (i = pos; i < lines.length; i++) {
        if (i >= pos) {
          pos += '\n'
        }
        body += lines[i];
      }
    }
    return Stomp.frame(command, headers, body);
  };

  Stomp.marshall = function(command, headers, body) {
    return Stomp.frame(command, headers, body).toString() + '\0';
  };
  
  Stomp.client = function (url){

    var that, ws, login, passcode;
    // subscriptions callback indexed by destination
    var subscriptions = {};

    debug = function(str) {
      if (that.debug) {
        that.debug(str);
      }
    };

    onmessage = function(evt) {
      debug('<<< ' + evt.data);
      // next, check what type of message RECEIPT, ERROR, CONNECTED, RECEIVE
      // and create appropriate js objects and calls handler for received messags
      // when CONNECTED is received, call onconnect
      // when RECEIVE is received, call onreceive
      // when ERROR is received, call onerror
      // when RECEIPT is received, call onreceipt
      var frame = Stomp.unmarshall(evt.data);
      if (frame.command === "CONNECTED" && that.connectCallback) {
        that.connectCallback(frame);
      } else if (frame.command === "MESSAGE") {
        var onreceive = subscriptions[frame.headers.destination];
        if (onreceive) {
          onreceive(frame);
        }
      } else if (frame.command === "RECEIPT" && that.onreceipt) {
        that.onreceipt(frame);
      } else if (frame.command === "ERROR" && that.onerror) {
        that.onerror(frame);
      }
    };

    transmit = function(command, headers, body) {
      var out = Stomp.marshall(command, headers, body);
      debug(">>> " + out);
      ws.send(out);
    }

    that = {};

    that.connect = function(login_, passcode_, connectCallback, errorCallback) {
      debug("Opening Web Socket...");
      ws = new WebSocket(url);
      ws.onmessage = onmessage;
      ws.onclose   = function() {
        var msg = "Whoops! Lost connection to " + url;
        debug(msg);
          if (errorCallback) {
            errorCallback(msg);
          }
      };
      ws.onopen    = function() {
        debug('Web Socket Opened...');
        transmit("CONNECT", {login: login, passcode: passcode});
        // onconnect handler will be called from onmessage when a CONNECTED frame is received
      };
      login = login_;
      passcode = passcode_;
      that.connectCallback = connectCallback;
    };

    that.disconnect = function(disconnectCallback) {
      transmit("DISCONNECT");
      // send to the server a DISCONNECT frame
      ws.close();
      if (disconnectCallback) {
        disconnectCallback();
      }
    };

    that.send = function(destination, headers, body) {
      var headers = headers || {};
      headers.destination = destination;
      transmit("SEND", headers, body);
    };

    that.subscribe = function(destination, headers, callback) {
      var headers = headers || {};
      headers.destination = destination;
      subscriptions[destination] = callback;
      transmit("SUBSCRIBE", headers);
    };

    that.unsubscribe = function(destination, headers) {
      var headers = headers || {};
      headers.destination = destination;
      delete subscriptions[destination];
      transmit("UNSUBSCRIBE", headers);
    };
    
    that.begin = function(transaction, headers) {
      var headers = headers || {};
      headers.transaction = transaction;
      transmit("BEGIN", headers);
    };

    that.commit = function(transaction, headers) {
      var headers = headers || {};
      headers.transaction = transaction;
      transmit("COMMIT", headers);
    };
    
    that.abort = function(transaction, headers) {
      var headers = headers || {};
      headers.transaction = transaction;
      transmit("ABORT", headers);
    };
    
    that.ack = function(message_id, headers) {
      var headers = headers || {};
      headers["message-id"] = message_id;
      transmit("ACK", headers);
    };
    return that;
  };
  
  window.Stomp = Stomp;

})(window);