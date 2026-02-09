import { Action, ActionPanel, Form, Toast, showToast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { upsertHabit } from "../lib/storage";
import { Habit, HabitDraft } from "../lib/types";

type HabitFormValues = {
  name: string;
  type: "habit" | "task";
  intervalMinutes: string;
  targetRepetitionsPerDay: string;
  expectedDurationMinutes: string;
  notes: string;
};

interface HabitFormProps {
  habit?: Habit;
  onSaved?: () => Promise<void> | void;
}

function parsePositiveInteger(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function HabitForm({ habit, onSaved }: HabitFormProps) {
  const { pop } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(values: HabitFormValues) {
    const name = values.name.trim();
    if (!name) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    const intervalMinutes = parsePositiveInteger(values.intervalMinutes, 60);
    const repetitions = parsePositiveInteger(values.targetRepetitionsPerDay, 1);
    const expectedDurationMinutes = values.expectedDurationMinutes.trim()
      ? parsePositiveInteger(values.expectedDurationMinutes, 1)
      : undefined;

    const draft: HabitDraft = {
      name,
      type: values.type,
      intervalMinutes,
      targetRepetitionsPerDay: repetitions,
      expectedDurationMinutes,
      notes: values.notes.trim() || undefined,
    };

    setIsSaving(true);
    try {
      await upsertHabit(draft, habit?.id);
      await showToast({
        style: Toast.Style.Success,
        title: habit ? "Habit updated" : "Habit created",
      });
      if (onSaved) {
        await onSaved();
      }
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to save",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Form
      navigationTitle={habit ? "Edit Habit" : "Add Habit"}
      isLoading={isSaving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={habit ? "Save Changes" : "Create Habit"} onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        text="Define how often this item should occur. Rayminder will flag it as overdue once the interval expires."
      />
      <Form.TextField id="name" title="Name" placeholder="Drink water" defaultValue={habit?.name} />
      <Form.Dropdown id="type" title="Type" defaultValue={habit?.type ?? "habit"}>
        <Form.Dropdown.Item value="habit" title="Habit" />
        <Form.Dropdown.Item value="task" title="Task" />
      </Form.Dropdown>
      <Form.TextField
        id="intervalMinutes"
        title="Interval (minutes)"
        placeholder="60"
        defaultValue={habit ? String(habit.intervalMinutes) : "60"}
      />
      <Form.TextField
        id="targetRepetitionsPerDay"
        title="Daily Repetitions"
        placeholder="1"
        defaultValue={habit ? String(habit.targetRepetitionsPerDay) : "1"}
      />
      <Form.TextField
        id="expectedDurationMinutes"
        title="Expected Duration (minutes, optional)"
        placeholder="20"
        defaultValue={habit?.expectedDurationMinutes ? String(habit.expectedDurationMinutes) : ""}
      />
      <Form.TextArea id="notes" title="Notes (optional)" defaultValue={habit?.notes} />
    </Form>
  );
}
