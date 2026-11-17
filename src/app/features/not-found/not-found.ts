import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

const MESSAGES: Record<string, { title: string; text: string }> = {
  'invalid-id': {
    title: 'Érvénytelen azonosító',
    text: 'Az azonosító csak pozitív egész szám lehet.',
  },
  'invalid-resource': {
    title: 'Ismeretlen törzsadat',
    text: 'Csak a címkék, állapotok és prioritások kezelhetők.',
  },
};

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFound {
  private readonly location = inject(Location);
  private readonly reason = inject(ActivatedRoute).snapshot.queryParamMap.get('reason');

  readonly message = (this.reason && MESSAGES[this.reason]) || {
    title: 'Az oldal nem található',
    text: 'A keresett oldal nem létezik vagy már nem érhető el.',
  };

  back(): void {
    this.location.back();
  }
}
