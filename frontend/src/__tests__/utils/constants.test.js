import { resolveRuntimeAwareUrl, shouldUseRuntimeOrigin } from '../../utils/constants';

describe('constants URL resolution', () => {
  it('uses runtime origin when env URL is empty', () => {
    expect(resolveRuntimeAwareUrl('', 'https://aquaguard.local', 'aquaguard.local'))
      .toBe('https://aquaguard.local');
  });

  it('uses runtime origin when env host mismatches runtime host', () => {
    expect(
      resolveRuntimeAwareUrl(
        'https://aquaguard.local',
        'http://localhost:3000',
        'localhost'
      )
    ).toBe('http://localhost:3000');
  });

  it('keeps env URL when host matches runtime host', () => {
    expect(
      resolveRuntimeAwareUrl(
        'http://localhost:5000',
        'http://localhost:3000',
        'localhost'
      )
    ).toBe('http://localhost:5000');
  });

  it('uses runtime origin to avoid mixed content on same host', () => {
    expect(
      shouldUseRuntimeOrigin(
        'http://aquaguard.local',
        'https://aquaguard.local',
        'aquaguard.local'
      )
    ).toBe(true);
  });

  it('returns env URL when runtime origin is unavailable', () => {
    expect(resolveRuntimeAwareUrl('http://localhost:5000', '', ''))
      .toBe('http://localhost:5000');
  });
});
