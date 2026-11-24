import { convertToParamMap } from '@angular/router';
import { parseFilters, toQueryParams, EMPTY_FILTERS } from './task-list.helpers';

describe('task-list filter URL helpers', () => {
  it('parses valid filters and trims search text', () => {
    expect(
      parseFilters(
        convertToParamMap({
          q: '  API  ',
          statusId: '2',
          assigneeId: '1',
          projectId: '42',
          sort: 'dueDate',
        }),
      ),
    ).toEqual({
      q: 'API',
      statusId: '2',
      assigneeId: '1',
      projectId: '42',
      sort: 'dueDate',
    });
  });

  it('drops invalid ids and unknown sort values', () => {
    expect(parseFilters(convertToParamMap({ statusId: '01', assigneeId: '-2', projectId: 'abc', sort: 'name' }))).toEqual(EMPTY_FILTERS);
  });

  it('omits empty and default parameters from the URL', () => {
    expect(toQueryParams(EMPTY_FILTERS)).toEqual({
      q: null,
      statusId: null,
      assigneeId: null,
      projectId: null,
      sort: null,
    });
  });
});
