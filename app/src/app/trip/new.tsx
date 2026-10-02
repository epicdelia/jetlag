import type { TripInput } from '@jetlag/engine';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ReturnTripIntro, useReturnTrip } from '@/components/return-trip';
import { TripForm } from '@/components/trip-form';
import { Banner, Screen } from '@/components/ui';
import { useAppStore } from '@/lib/store';
import { editDraft, keepSavedReturnStart } from '@/lib/trip-edit';

/**
 * New trip, or (with params) edit an existing one / plan the way home:
 *   /trip/new                 blank form
 *   /trip/new?edit=<id>       prefilled from that trip; saving replaces it and resyncs reminders
 *   /trip/new?returnOf=<id>   outbound route reversed (destination → origin)
 */
export default function NewTrip() {
  const { edit, returnOf } = useLocalSearchParams<{ edit?: string; returnOf?: string }>();
  const { trips } = useAppStore();
  const editing = edit ? trips.find((t) => t.id === edit) : undefined;
  // The outbound trip: for a new return trip, or when editing an existing return trip.
  const outboundId = edit ? editing?.returnOf : returnOf;
  const outbound = outboundId ? trips.find((t) => t.id === outboundId) : undefined;
  const ret = useReturnTrip(outbound);
  // TripForm reads `initial` only on mount (useState initialisers), so later store updates
  // (e.g. a reminder resync) never reset what the user has typed.
  const initial = editing ? editDraft(editing) : ret?.draft;

  if (edit && !editing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit trip' }} />
        <Banner>That trip no longer exists.</Banner>
      </Screen>
    );
  }

  if (editing) {
    // A return trip whose outbound trip was deleted keeps the starting body clock saved with it
    // (otherwise the rebuilt plan would assume full adaptation to where the traveller is).
    const orphanReturn = !!editing.returnOf && !outbound;
    const adjustInput = ret?.adjustInput ?? (orphanReturn ? (i: TripInput) => keepSavedReturnStart(i, editing.input) : undefined);
    return (
      <>
        <Stack.Screen options={{ title: 'Edit trip' }} />
        <TripForm
          key={editing.id}
          initial={initial}
          editing={editing}
          adjustInput={adjustInput}
          intro={
            orphanReturn ? (
              <Banner tone="info">
                The outbound trip for this return was deleted, so the plan keeps the body-clock estimate saved when you
                planned it.
              </Banner>
            ) : undefined
          }
          submitTitle="Save and rebuild plan"
        />
      </>
    );
  }

  if (ret) {
    return (
      <>
        <Stack.Screen options={{ title: 'Return trip' }} />
        <TripForm
          key={ret.key}
          initial={initial}
          meta={{ returnOf: ret.outbound.id }}
          adjustInput={ret.adjustInput}
          intro={<ReturnTripIntro info={ret} />}
          submitTitle="Build my return plan"
        />
      </>
    );
  }

  return <TripForm />;
}
