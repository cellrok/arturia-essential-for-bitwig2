loadAPI(6);

load("lib/InputMIDI.js");
load("lib/InputDAW.js");
load("lib/MidiData.js");

host.setShouldFailOnDeprecatedUse(false);
host.defineController("Arturia", "KeyLab Essential 61", "0.1", "ddbaf2f0-93cd-468c-bf19-0cccdeb74e0b", "cellrok");
host.defineMidiPorts(2, 2);

if (host.platformIsWindows()) {
  // TODO
  // host.addDeviceNameBasedDiscoveryPair(["Input Port 0", "Input Port 1"], ["Output Port 0", "Output Port 1"]);
}
else if (host.platformIsMac()) {
  host.addDeviceNameBasedDiscoveryPair(["Arturia KeyLab Essential 61 MIDI In", "Arturia KeyLab Essential 61 DAW In"], ["Arturia KeyLab Essential 61 MIDI Out", "Arturia KeyLab Essential 61 DAW Out"]);
}
else if (host.platformIsLinux()) {
  // TODO
  // host.addDeviceNameBasedDiscoveryPair(["Input Port 0", "Input Port 1"], ["Output Port 0", "Output Port 1"]);
}

// Send Text to KeyLab Display:
function sendTextToKeyLab(line1, line2) {
  sendSysex("F0 00 20 6B 7F 42 04 00 60 01 " + line1.toHex(16) + " 00 02 " + line2.toHex(16) + " 00 F7");
}

var portMIDI, portMIDIinput;
var portDAW, portDAWoutput;


var BROWSER_IS_OPEN = 0;
var HOLDING_LIVEBANK = false;
var HOLDING_METRO = false;
var NUM_FILTERS = 1;
var NUM_FILTERS_ITEMS = 16;

var presetHasChanged = false;
var pageNames = [];
var browserColumns = [];
var browserColumnsItems = [];
var browserCursors = [];
var browserColumnName = '';
var browserCursorName = '';

// knob 1-9
var knobBank = [74, 71, 76, 77, 93, 18, 19, 16, 17];
var knobIndex = {74:0,71:1,76:2,77:3,93:4,18:5,19:6,16:7,17:8};

// fader 1-9
var faderBank = [73, 75, 79, 72, 80, 81, 82, 83, 85];
var faderIndex = {73:0,75:1,79:2,72:3,80:4,81:5,82:6,83:7,85:8};

var presetColumns = {};

function init() {
  var p, i, j, item;

  transport = host.createTransport();

  portMIDI = host.getMidiInPort(0);
  portDAW = host.getMidiInPort(1);

  portMIDI.setMidiCallback(onMidi0);
  portMIDI.setSysexCallback(onSysex0);

  portDAW.setMidiCallback(onMidi1);
  portDAW.setSysexCallback(onSysex1);


  /**
   * Instances
   * -------------------------------------------------------
   */

  portMIDIinput = host.getMidiInPort(0).createNoteInput("All Channels", "??????");
  portMIDIinput.setShouldConsumeEvents(false);
  //portMIDIinput.assignPolyphonicAftertouchToExpression(0, NoteExpression.TIMBRE_UP, 2);

  application = host.createApplication();
  masterTrack = host.createMasterTrack(0);
  cursorTrack = host.createCursorTrack(3, 0);
  cursorDevice = cursorTrack.createCursorDevice();
  trackBank = host.createMainTrackBank(8, 0, 0);
  deviceBrowser = cursorDevice.createDeviceBrowser(NUM_FILTERS,NUM_FILTERS_ITEMS);
  presetBrowser = deviceBrowser.getPresetSession();
  browserFilterBank = presetBrowser.createFilterBank(NUM_FILTERS);
  remoteControls = cursorDevice.createCursorRemoteControlsPage(9);
  userControls = host.createUserControls(9);

  /**
   * Browser Filter
   * -------------------------------------------------------
   */
  /**
   * @type {API.BrowserFilterColumn}
   */

  /**
    for (i = 0; i < NUM_FILTERS; i++) {
      browserColumns[i] = browserFilterBank.getItem(i);
      browserColumns[i].addNameObserver(20, "", function(name){
        presetColumns[name] = i;
        if (BROWSER_IS_OPEN && name !== browserColumnName) {
          sendTextToKeyLab(browserColumnName, browserCursorName);
        }
        browserColumnName = name;
      });
      browserColumnsItems[i] = browserColumns[i].createItemBank(NUM_FILTERS_ITEMS);
      browserColumnsItems[i].addCanScrollDownObserver(function (canScroll) {
        //println('browserColumnsItems canScroll ' + (canScroll ? 'yes' : 'no'));
      });
      browserCursors[i] = browserColumns[i].createCursorItem();
      browserCursors[i].addValueObserver(20, "", function(name){
        if (BROWSER_IS_OPEN && name !== browserCursorName) {
          sendTextToKeyLab(browserColumnName, browserCursorName);
        }
        browserCursorName = name;
      });
      browserCursors[i].addValueObserver(20, '', function (itemName) {
        //println('browserCursors addValueObserver ' + itemName);
      });

      for (j = 0; j < NUM_FILTERS_ITEMS; j++) {
        item = browserColumnsItems[i].getItem(j);
        item.isSelected().addValueObserver(function (exists) {
          println('item isSelected ' + (exists ? 'yes' : 'no'));
        });
        item.addValueObserver(20, '', function (itemName) {
          //println('browserColumnsItems addValueObserver ' + itemName);
        });
      }
    }
  */

  /**
   * Remote Controls
   * -------------------------------------------------------
   */
  // initialize RemoteControlsPage
  for (i = 0; i < 8; i++) {
    p = remoteControls.getParameter(i).getAmount();
    p.setIndication(true);
    p.setLabel("P" + (i + 1));
  }

  // initialize UserControlBank
  for (i = 0; i < faderBank.length; i++) {
    userControls.getControl(i).setLabel("CC" + faderBank[i]);
  }

  /**
   * Observers
   * -------------------------------------------------------
   */
  deviceBrowser.addIsBrowsingObserver(function (status) {
    BROWSER_IS_OPEN = status;
  });

  transport.tempo().addRawValueObserver(function (status){
    sendTextToKeyLab("Transport:", 'Tempo ' + transport.tempo().value().getRaw() + ' BPM');
  });

  transport.addIsRecordingObserver(function (status) {
    if (status) {
      sendTextToKeyLab("Transport:", "Record Enabled");
    } else {
      sendTextToKeyLab("Transport:", "Record Disabled");
    }
  });

  /**
   * Say hello
   * -------------------------------------------------------
   */
  sendTextToKeyLab('Bitwig', 'Essential');
  host.showPopupNotification("KeyLab Essential 61 plugged in");
}

// -------------------------------------------------------------------
// GENERAL MIDI INPUT
// -------------------------------------------------------------------
function onMidi0(status, data1, data2) {
  var index, midi = new MidiData(status, data1, data2);

  if (midi.isChannelController())
  {
    // -------------------------------------------------------------------
    // DEVICE MACRO CC (knobs)
    // -------------------------------------------------------------------
    if (typeof knobIndex[data1] !== 'undefined') {
      index = knobIndex[data1];

      if (index === 8) {
        masterTrack.getPan().set(data2, 128);
      } else {
        if (HOLDING_LIVEBANK) {
          trackBank.getTrack(index).getPan().set(data2, 128);
        } else {
          remoteControls.getParameter(index).getAmount().value().set(data2, 128);
        }
      }
    }

    // -------------------------------------------------------------------
    // USER CC (faders)
    // -------------------------------------------------------------------
    if (typeof faderIndex[data1] !== 'undefined') {
      index = faderIndex[data1];

      if (index === 8) {
        masterTrack.getVolume().set(data2, 128);
      } else {
        if (HOLDING_LIVEBANK) {
          trackBank.getTrack(index).getVolume().set(data2, 128);
        } else {
          userControls.getControl(index).value().set(data2, 128);
        }
      }
    }

    // -------------------------------------------------------------------
    // PRESET WHEEL
    // -------------------------------------------------------------------
    if (midi.isPressed()) {
      switch (data1)
      {
        case InputMIDI.CC_JOG_PRESS_CATEGORY: // open browser and focus "Category" column
          println('CC_JOG_PRESS_CATEGORY');
          if (BROWSER_IS_OPEN) {
            deviceBrowser.commitSelectedResult();
          } else {
            deviceBrowser.startBrowsing();
            presetBrowser.activate();
            application.arrowKeyDown();
          }
          break;

        case InputMIDI.CC_JOG_PRESS_PRESET: // open browser and focus "Preset" column
          println('CC_JOG_PRESS_PRESET');
          if (BROWSER_IS_OPEN) {
            deviceBrowser.commitSelectedResult();
          } else {
            deviceBrowser.startBrowsing();
            presetBrowser.activate();
            application.arrowKeyDown();
          }
          break;

        case InputMIDI.CC_BTN_ARROW_LEFT:  // move between filter columns
          println('CC_BTN_ARROW_LEFT');
          application.arrowKeyUp();
          break;

        case InputMIDI.CC_BTN_ARROW_RIGHT:  // move between filter columns
          println('CC_BTN_ARROW_RIGHT');
          application.arrowKeyDown();
          break;

        case InputMIDI.CC_BTN_CATEGORY:  // select column "Category" and focus first item
          println('CC_BTN_CATEGORY');

          break;

        case InputMIDI.CC_BTN_PRESET:  // select column "Preset" and focus first item
          println('CC_BTN_PRESET');

          break;


        case InputMIDI.CC_BTN_BANK_NEXT:
          remoteControls.selectNextPage(false);
          break;

        case InputMIDI.CC_BTN_BANK_PREV:
          remoteControls.selectPreviousPage(false);
          break;

        case InputMIDI.CC_BTN_BANK_LIVE:
          HOLDING_LIVEBANK = true; // Used as "SHIFT" for Faders and Knobs
          break;
      }
    }
    else if (midi.isReleased()) { // button release
      switch (data1)
      {
        case InputMIDI.CC_BTN_BANK_LIVE:
          HOLDING_LIVEBANK = false;
          break;
      }
    }

    // -------------------------------------------------------------------
    // PRESET WHEEL MOVEMENT
    // -------------------------------------------------------------------

    if (BROWSER_IS_OPEN) {
      // wheel turned right
      if ((data1 === InputMIDI.CC_JOG_DIAL_CATEGORY && midi.isOff()) || (data1 ===  InputMIDI.CC_JOG_DIAL_PRESET && midi.isOff())) {
        application.arrowKeyUp();
        println('arrow key up (wheel right)');
      }
      // wheel turned left
      if ((data1 === InputMIDI.CC_JOG_DIAL_CATEGORY && midi.isOn()) || (data1 === InputMIDI.CC_JOG_DIAL_PRESET && midi.isOn())) {
        application.arrowKeyDown();
        println('arrow key down (wheel left)');
      }
    }

    // -------------------------------------------------------------------
    // TEMPO WHEEL (when holding down METRO button)
    // -------------------------------------------------------------------

    if (HOLDING_METRO) { // wheel adjusts tempo
      // wheel turned right
      if ((data1 === InputMIDI.CC_JOG_DIAL_CATEGORY && midi.isOff()) || (data1 ===  InputMIDI.CC_JOG_DIAL_PRESET && midi.isOff())) {
        transport.tempo().value().setRaw(transport.tempo().value().getRaw() - 1);
      }
      // wheel turned left
      if ((data1 === InputMIDI.CC_JOG_DIAL_CATEGORY && midi.isOn()) || (data1 === InputMIDI.CC_JOG_DIAL_PRESET && midi.isOn())) {
        transport.tempo().value().setRaw(transport.tempo().value().getRaw() + 1);
      }
    }
  }
}


// -------------------------------------------------------------------
// SYSEX
// -------------------------------------------------------------------
function onSysex0(data) {
  switch (data) {
    case InputMIDI.SYSEX_BTN_MIDI_CH: // midi channel button

      break;
  }
}

// -------------------------------------------------------------------
// DAW COMMAND CENTER
// -------------------------------------------------------------------
function onMidi1(status, data1, data2) {
  var midi = new MidiData(status, data1, data2);

  println(midi.type() + ' ' + data1 + ' ' + data2);




    if (midi.isPressed()) {
      switch (data1)
      {
        case InputDAW.CC_SAVE:
          break;
        case InputDAW.CC_UNDO:
          application.undo();
          break;
        case InputDAW.CC_LOOP:
          transport.isArrangerLoopEnabled().toggle();
          break;
        case InputDAW.CC_PUNCH:
          transport.isArrangerOverdubEnabled().toggle();
          transport.isClipLauncherOverdubEnabled().toggle();
          break;
        case InputDAW.CC_METRONOME:
          transport.isMetronomeEnabled().toggle();
          HOLDING_METRO = true;
          break;
        case InputDAW.CC_REWIND:
          transport.rewind();
          break;
        case InputDAW.CC_FORWARD:
          transport.fastForward();
          break;
        case InputDAW.CC_STOP:
          // println("Stop");
          transport.stop();
          break;
        case InputDAW.CC_PLAY:
          // println("Play/Pause");
          transport.play();
          break;
        case InputDAW.CC_RECORD:
          // println("Record");
          transport.record();
          break;
      }
    }
    else if (midi.isReleased()) {
      switch (data1)
      {
        case InputDAW.CC_METRONOME:
          HOLDING_METRO = false;
          break;
      }
    }
}


function onSysex1(data) {

}


function flush() {

}

function exit() {

}