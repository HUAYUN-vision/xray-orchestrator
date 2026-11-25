import { Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Currency } from '../../database/enums';
import type { Tariff } from '../../database/entities';
import { TariffsAdminError, TariffsAdminService } from './tariffs-admin.service';

const ID = '22222222-2222-4222-8222-222222222222';
const input = {
  durationDays: 30,
  price: '299',
  currency: Currency.RUB,
  trafficLimit: null,
};
const tariff = (active = true): Tariff => ({
  ...input,
  id: ID,
  active,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('TariffsAdminService', () => {
  let tariffs: Record<string, jest.Mock>;
  let keys: Record<string, jest.Mock>;
  let service: TariffsAdminService;
  const order: string[] = [];

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    order.length = 0;
    tariffs = {
      findAll: jest.fn().mockResolvedValue([tariff(), { ...tariff(false), id: 'other' }]),
      findById: jest.fn().mockResolvedValue(tariff()),
      create: jest.fn(() => (order.push('create'), Promise.resolve(tariff()))),
      setActive: jest.fn().mockResolvedValue(true),
      delete: jest.fn(() => (order.push('delete'), Promise.resolve())),
      countActive: jest.fn().mockResolvedValue(1),
    };
    keys = {
      countByTariff: jest.fn((id: string) => Promise.resolve(id === ID ? 2 : 0)),
    };
    service = new TariffsAdminService(tariffs as never, keys as never);
  });

  it('list pairs each tariff with the number of keys sold on it', async () => {
    const list = await service.list();
    expect(list.map((s) => [s.tariff.id, s.keys])).toEqual([
      [ID, 2],
      ['other', 0],
    ]);
  });

  it('add saves the tariff and reports whether the shop is empty', async () => {
    const change = await service.add(input);
    expect(tariffs.create).toHaveBeenCalledWith(input);
    expect(change).toMatchObject({ tariff: { id: ID }, keys: 2, noneActive: false });
  });

  it('hide and show go through setActive; noneActive when nothing is on sale', async () => {
    tariffs.countActive.mockResolvedValue(0);
    tariffs.findById.mockResolvedValue(tariff(false));
    await expect(service.setActive(ID, false)).resolves.toMatchObject({
      tariff: { active: false },
      noneActive: true,
    });
    expect(tariffs.setActive).toHaveBeenCalledWith(ID, false);
  });

  it('setActive of an unknown tariff does not read it back', async () => {
    tariffs.setActive.mockResolvedValue(false);
    await expect(service.setActive(ID, true)).rejects.toBeInstanceOf(TariffsAdminError);
    await expect(service.setActive(ID, true)).rejects.toMatchObject({ code: 'not_found' });
    expect(tariffs.findById).not.toHaveBeenCalled();
  });

  it('remove refuses while keys exist and does not delete the row', async () => {
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'in_use' });
    expect(order).toEqual([]);
    expect(tariffs.delete).not.toHaveBeenCalled();
  });

  it('remove deletes a tariff nobody bought', async () => {
    keys.countByTariff.mockResolvedValue(0);
    tariffs.countActive.mockResolvedValue(0);
    const change = await service.remove(ID);
    expect(order).toEqual(['delete']);
    expect(change.noneActive).toBe(true);
  });

  it('remove of an unknown tariff does not count keys', async () => {
    tariffs.findById.mockResolvedValue(null);
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'not_found' });
    expect(keys.countByTariff).not.toHaveBeenCalled();
  });

  it('a key bought between the check and the delete is still "in use"', async () => {
    keys.countByTariff.mockResolvedValue(0);
    const driverError = new Error('fk') as Error & { code: string };
    driverError.code = '23503';
    tariffs.delete.mockRejectedValue(new QueryFailedError('DELETE', [], driverError));
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'in_use' });
  });

  it('a database error other than the foreign key is rethrown', async () => {
    keys.countByTariff.mockResolvedValue(0);
    tariffs.delete.mockRejectedValue(new Error('connection reset'));
    await expect(service.remove(ID)).rejects.toThrow('connection reset');
  });
});
