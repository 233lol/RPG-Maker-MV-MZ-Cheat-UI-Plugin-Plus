// @ts-check
export default {
  interpretCodes(code) {
    switch (code) {
      case 101:
        return "show text";
      case 401:
        return "text line";

      case 102:
        return "show choices";
      case 402:
        return "when";
      case 403:
        return "when cancel";
      case 0:
        return "nop";
      case 404:
        return "end choices";

      case 103:
        return "input numbers";

      case 104:
        return "select item";

      case 105:
        return "scrolling texts";
      case 405:
        return "scrolling textline";

      case 121:
        return "set switches";
      case 122:
        return "set variables";
      case 123:
        return "set self switch";
      case 124:
        return "set timer";

      case 111:
        return "begin if";
      case 411:
        return "else";
      case 412:
        return "end if";
      case 112:
        return "loop";
      case 413:
        return "repeat above";
      case 113:
        return "loop break";
      case 115:
        return "exit event";
      case 116:
        return "erase event";
      case 117:
        return "common event";
      case 118:
        return "labeling";
      case 119:
        return "jump";
      case 108:
        return "comment";

      case 125:
        return "set gold";
      case 126:
        return "set items";
      case 127:
        return "set weapons";
      case 128:
        return "set armors";
      case 129:
        return "set party member";

      case 311:
        return "change HP";
      case 312:
        return "change MP";
      case 326:
        return "change TP";
      case 313:
        return "change state";
      case 314:
        return "recover all";
      case 315:
        return "change EXP";
      case 316:
        return "change level";
      case 317:
        return "change parameters";
      case 318:
        return "change skills";
      case 319:
        return "change equipment";
      case 320:
        return "change name";
      case 321:
        return "change class";
      case 324:
        return "change nickname";
      case 325:
        return "change profile";

      case 201:
        return "set coord";
      case 202:
        return "set vehicle coord";
      case 203:
        return "set event coord";
      case 204:
        return "scroll map";
      case 205:
        return "set movement route";
      case 206:
        return "toggle vehicle";

      default:
        return "";
    }
  },
};
