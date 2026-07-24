import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";

export class PlayerIcon extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-icon.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.updateHue();
    this.render();

    // The color, once set at connect time, otherwise never changed again --
    // re-picking a color in settings wouldn't show up on an already-mounted
    // icon until a full page reload. Subscribing picks up live updates too.
    this.subscribe(`color:${this.playerName}`, this.updateHue.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  updateHue() {
    const hue = groupData.members.get(this.playerName).hue || 0;
    this.style.setProperty("--player-icon-color", `${hue}deg`);
  }
}

customElements.define("player-icon", PlayerIcon);
