// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// postDelete spy — shared across all DeleteAPI instances
const postDeleteMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@influxdata/influxdb-client-apis', () => {
  class DeleteAPI {
    postDelete = postDeleteMock;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(..._args: unknown[]) {}
  }
  return { DeleteAPI };
});

vi.mock('@influxdata/influxdb-client', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function InfluxDB(this: unknown, ..._args: unknown[]) {}
  return { InfluxDB };
});

const { deleteChemistryPoint } = await import('./influxDelete');

beforeEach(() => {
  postDeleteMock.mockClear();
});

describe('deleteChemistryPoint', () => {
  it('calls postDelete once with start=id, stop=id+1ms, and the chemistry predicate', async () => {
    const id = '2026-05-20T20:30:00.000Z';
    await deleteChemistryPoint(id);

    expect(postDeleteMock).toHaveBeenCalledOnce();

    const [arg] = postDeleteMock.mock.calls[0] as [{ org: string; bucket: string; body: { start: string; stop: string; predicate: string } }];
    expect(arg.body.start).toBe(id);
    expect(arg.body.stop).toBe('2026-05-20T20:30:00.001Z');
    expect(arg.body.predicate).toBe('_measurement="chemistry"');
  });

  it('passes org and bucket from env (or defaults to empty string)', async () => {
    const id = '2026-05-20T20:30:00.000Z';
    await deleteChemistryPoint(id);
    const [arg] = postDeleteMock.mock.calls[0] as [{ org: string; bucket: string }];
    // In test environment the env vars are not set; they default to ''.
    expect(typeof arg.org).toBe('string');
    expect(typeof arg.bucket).toBe('string');
  });
});
