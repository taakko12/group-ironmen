import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";
import { Item } from "../data/item";
import { api } from "../data/api";
import { mustBankItems } from "../data/must-bank-items";

export class ItemBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{item-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.noTooltip = this.hasAttribute("no-tooltip");
    this.playerName = this.getAttribute("player-name");
    this.veryShortQuantity = this.hasAttribute("very-short-quantity");
    this.quantity = this.item?.quantity || parseInt(this.getAttribute("item-quantity"));
    this.itemId = this.item?.id || parseInt(this.getAttribute("item-id"));

    if (!this.noTooltip) {
      this.enableTooltip();
      if (this.item) {
        const inventoryType = this.getAttribute("inventory-type");
        const totalInventoryQuantity = groupData.inventoryQuantityForItem(this.item.id, this.playerName, inventoryType);
        const stackHighAlch = totalInventoryQuantity * this.item.highAlch;
        const stackGePrice = totalInventoryQuantity * this.item.gePrice;

        this.tooltipText = `
${this.item.name} x ${totalInventoryQuantity}
<br />
HA: ${stackHighAlch.toLocaleString()}
<br />
GE: ${stackGePrice.toLocaleString()}`;
      } else {
        this.tooltipText = `${Item.itemName(this.itemId)} x ${this.quantity.toLocaleString()}`;
      }
    }

    this.render();

    if (!this.noTooltip && this.itemId > 0) {
      this.tagButton = this.querySelector(".item-box__tag-button");
      this.eventListener(this.tagButton, "click", this.handleTagClick.bind(this));
      this.subscribe("must-bank-items-updated", this.updateTagState.bind(this));
      this.updateTagState();

      this.requestButton = this.querySelector(".item-box__request-button");
      if (this.requestButton) {
        this.eventListener(this.requestButton, "click", this.handleRequestClick.bind(this));
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  updateTagState() {
    if (this.tagButton) {
      this.tagButton.classList.toggle("item-box__tag-button--tagged", mustBankItems.has(this.itemId));
    }
  }

  async handleTagClick(event) {
    event.stopPropagation();
    if (mustBankItems.has(this.itemId)) {
      await mustBankItems.untag(this.itemId);
    } else {
      await mustBankItems.tag(this.itemId);
    }
  }

  async handleRequestClick(event) {
    event.stopPropagation();
    await api.requestBank(this.playerName, this.itemId);
    this.requestButton.classList.add("item-box__request-button--sent");
    setTimeout(() => this.requestButton?.classList.remove("item-box__request-button--sent"), 2000);
  }
}
customElements.define("item-box", ItemBox);
