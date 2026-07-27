import { BaseElement } from "../base-element/base-element";
import { goals } from "../data/goals";
import { utility } from "../utility";

const LAST_GOAL_AUTHOR_KEY = "lastGoalAuthor";
const REFRESH_INTERVAL_MS = 10000;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export class GoalListPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{goal-list-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.descriptionInput = this.querySelector(".goal-list-page__description");
    this.memberSelect = this.querySelector(".goal-list-page__member");
    this.addButton = this.querySelector(".goal-list-page__add");
    this.error = this.querySelector(".goal-list-page__error");
    this.list = this.querySelector(".goal-list-page__list");

    this.eventListener(this.addButton, "click", this.handleAdd.bind(this));
    this.eventListener(this.list, "click", this.handleListClick.bind(this));
    this.subscribe("goals-updated", this.renderList.bind(this));
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));

    this.renderList();
    this.refreshTimer = utility.callOnInterval(goals.load.bind(goals), REFRESH_INTERVAL_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.refreshTimer);
  }

  handleUpdatedMembers(members) {
    const selected = this.memberSelect.value || localStorage.getItem(LAST_GOAL_AUTHOR_KEY) || "";
    let options = "";
    for (const member of members) {
      if (member.name === "@SHARED") continue;
      options += `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${
        member.name
      }</option>`;
    }
    this.memberSelect.innerHTML = options;
  }

  renderList() {
    if (goals.goals.length === 0) {
      this.list.innerHTML = `<li class="goal-list-page__empty">No goals yet -- add one above.</li>`;
      return;
    }

    this.list.innerHTML = goals.goals.map((goal) => GoalListPage.rowHtml(goal)).join("");
  }

  static rowHtml(goal) {
    const checkboxId = `goal-done-${goal.id}`;
    return `
<li class="goal-list-page__item rsborder-tiny rsbackground rsbackground-hover ${
      goal.done ? "goal-list-page__item--done" : ""
    }" data-id="${goal.id}">
  <input type="checkbox" id="${checkboxId}" class="goal-list-page__done" ${goal.done ? "checked" : ""} />
  <label for="${checkboxId}" class="goal-list-page__description-text">${escapeHtml(goal.description)}</label>
  <span class="goal-list-page__added-by">${escapeHtml(goal.added_by)}</span>
  <button type="button" class="goal-list-page__delete men-button small">Remove</button>
</li>`;
  }

  handleListClick(event) {
    const item = event.target.closest(".goal-list-page__item");
    if (!item) return;
    const id = parseInt(item.dataset.id, 10);

    if (event.target.classList.contains("goal-list-page__done")) {
      goals.setDone(id, event.target.checked);
    } else if (event.target.classList.contains("goal-list-page__delete")) {
      goals.remove(id);
    }
  }

  async handleAdd() {
    this.error.innerHTML = "";
    const description = this.descriptionInput.value.trim();
    const addedBy = this.memberSelect.value;

    if (!description) {
      this.error.innerHTML = "Enter a goal description";
      return;
    }
    if (!addedBy) {
      this.error.innerHTML = "Select a member";
      return;
    }

    localStorage.setItem(LAST_GOAL_AUTHOR_KEY, addedBy);
    this.descriptionInput.value = "";
    await goals.add(description, addedBy);
  }
}

customElements.define("goal-list-page", GoalListPage);
