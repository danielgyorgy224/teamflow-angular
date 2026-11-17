import { Component } from '@angular/core';
import { HasUnsavedChanges } from '../../core/guards/route-guards';

/** TODO (B): közös új/szerkesztő feladatűrlap. A CanDeactivate guard a hasUnsavedChanges()-t hívja. */
@Component({
  selector: 'app-task-form',
  templateUrl: './task-form.html',
  styleUrl: './task-form.css',
})
export class TaskForm implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return false; // TODO: form.dirty && !mentve
  }
}
