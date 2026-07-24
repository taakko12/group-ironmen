import { BaseElement } from "../base-element/base-element";
import { mustBankItems } from "../data/must-bank-items";
import { bankRequestSelection } from "../data/bank-request-selection";

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
    this.subscribe("bank-request-selection-updated", this.syncRequestCheckboxes.bind(this));
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
    ? `<input type="checkbox" id="${this.checkboxId(playerName)}" class="inventory-item__request-checkbox" data-player-name="${playerName}"
        ${bankRequestSelection.has(playerName, this.itemId) ? "checked" : ""} /><label for="${this.checkboxId(
        playerName
      )}" class="inventory-item__request-label" title="Select to request ${playerName} bank this"></label>`
    : "<span></span>"
}
`;
  }

  // input[type="checkbox"] is display:none site-wide (see main.css) -- the
  // visible box comes from an adjacent <label>'s ::before via a for/id pair
  // (same pattern as the "Individual item price" toggle), not the input
  // itself. That also means the input doesn't generate a grid item (a
  // display:none element is excluded from grid placement entirely), so this
  // pair still counts as exactly one cell in .inventory-item__bottom's
  // 4-column layout, same as the single element it replaced.
  checkboxId(playerName) {
    return `bank-request-${this.itemId}-${playerName.replace(/[^a-zA-Z0-9]/g, "-")}`;
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

    for (const checkbox of this.querySelectorAll(".inventory-item__request-checkbox")) {
      this.eventListener(checkbox, "change", this.handleRequestCheckboxChange.bind(this));
    }
  }

  // Re-applies checked state onto existing checkboxes (rather than a full
  // re-render) when the selection changes elsewhere, e.g. the Items page's
  // batch button clearing everything after a successful send.
  syncRequestCheckboxes() {
    for (const checkbox of this.querySelectorAll(".inventory-item__request-checkbox")) {
      checkbox.checked = bankRequestSelection.has(checkbox.dataset.playerName, this.itemId);
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

  handleRequestCheckboxChange(event) {
    event.stopPropagation();
    const checkbox = event.currentTarget;
    bankRequestSelection.toggle(checkbox.dataset.playerName, this.itemId, checkbox.checked);
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
