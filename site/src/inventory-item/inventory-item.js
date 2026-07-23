import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { mustBankItems } from "../data/must-bank-items";

export class InventoryItem extends BaseElement {
  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    const itemId = this.getAttribute("item-id");
    this.itemId = parseInt(itemId);
    this.showIndividualItemPrices = this.hasAttribute("individual-prices");
    this.playerFilter = this.getAttribute("player-filter");

    const top = this.offsetTop;
    const bottomOfPage = document.body.clientHeight;
    if (top < bottomOfPage) {
      this.subscribe(`item-update:${itemId}`, this.handleUpdatedItem.bind(this));
    } else {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        for (const x of entries) {
          if (x.isIntersecting && x.target === this) {
            this.intersectionObserver.disconnect();
            this.subscribe(`item-update:${itemId}`, this.handleUpdatedItem.bind(this));
            return;
          }
        }
      }, {});
      this.intersectionObserver.observe(this);
    }

    this.subscribe("must-bank-items-updated", this.updateTagState.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  /* eslint-disable no-unused-vars */
  html() {
    const item = this.item;
    let playerHtml = "";
    const totalQuantity = this.quantity;

    if (this.playerFilter) {
      playerHtml = this.playerHtml(this.playerFilter);
    } else {
      for (const [playerName, quantity] of Object.entries(item.quantities)) {
        if (quantity === 0) continue;
        playerHtml += this.playerHtml(playerName);
      }
    }

    return `{{inventory-item.html}}`;
  }
  /* eslint-enable no-unused-vars */

  playerHtml(playerName) {
    const quantity = this.item.quantities[playerName];
    const totalQuantity = this.quantity;
    const quantityPercent = Math.round((quantity / totalQuantity) * 100);
    return `
<span class="${quantity === 0 ? "inventory-item__no-quantity" : ""}">${playerName}</span>
<span>${quantity.toLocaleString()}</span>
<div class="inventory-item__quantity-bar"
     style="transform: scaleX(${quantityPercent}%); background: hsl(${quantityPercent}, 100%, 40%);">
</div>
${
  quantity > 0
    ? `<span class="inventory-item__request-button" data-player-name="${playerName}" title="Ask ${playerName} to bank this">📢</span>`
    : "<span></span>"
}
`;
  }

  handleUpdatedItem(item) {
    this.item = item;
    this.render();
    this.classList.add("rendered");

    this.tagButton = this.querySelector(".inventory-item__tag-button");
    if (this.tagButton) {
      this.eventListener(this.tagButton, "click", this.handleTagClick.bind(this));
      this.updateTagState();
    }

    for (const button of this.querySelectorAll(".inventory-item__request-button")) {
      this.eventListener(button, "click", this.handleRequestClick.bind(this));
    }
  }

  updateTagState() {
    if (this.tagButton) {
      this.tagButton.classList.toggle("inventory-item__tag-button--tagged", mustBankItems.has(this.itemId));
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
    const button = event.currentTarget;
    const playerName = button.dataset.playerName;
    await api.requestBank(playerName, this.itemId);
    button.classList.add("inventory-item__request-button--sent");
    setTimeout(() => button.classList.remove("inventory-item__request-button--sent"), 2000);
  }

  get quantity() {
    if (this.playerFilter) {
      return this.item.quantities[this.playerFilter];
    }

    return this.item.quantity;
  }

  get highAlch() {
    const highAlch = this.item.highAlch;
    if (highAlch === 0) return "N/A";

    if (this.showIndividualItemPrices) {
      return highAlch.toLocaleString() + "gp";
    }

    return (this.quantity * highAlch).toLocaleString() + "gp";
  }

  get gePrice() {
    const gePrice = this.item.gePrice;
    if (gePrice === 0) return "N/A";

    if (this.showIndividualItemPrices) {
      return gePrice.toLocaleString() + "gp";
    }

    return (this.quantity * gePrice).toLocaleString() + "gp";
  }
}
customElements.define("inventory-item", InventoryItem);
