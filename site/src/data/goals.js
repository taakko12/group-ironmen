import { api } from "./api";
import { pubsub } from "./pubsub";

// Group-wide shared goal/to-do list -- reloaded on an interval by whichever
// page has it open (see goal-list-page.js) so members see each other's
// additions/completions without needing a websocket.
class Goals {
  constructor() {
    this.goals = [];
  }

  async load() {
    try {
      this.goals = await api.getGoals();
      pubsub.publish("goals-updated");
    } catch (err) {
      console.error("Failed to load goals", err);
    }
  }

  async add(description, addedBy) {
    try {
      await api.addGoal(description, addedBy);
    } finally {
      await this.load();
    }
  }

  async setDone(id, done) {
    const goal = this.goals.find((g) => g.id === id);
    if (goal) goal.done = done;
    pubsub.publish("goals-updated");
    try {
      await api.setGoalDone(id, done);
    } finally {
      await this.load();
    }
  }

  async remove(id) {
    this.goals = this.goals.filter((g) => g.id !== id);
    pubsub.publish("goals-updated");
    try {
      await api.deleteGoal(id);
    } finally {
      await this.load();
    }
  }
}

const goals = new Goals();

export { goals };
