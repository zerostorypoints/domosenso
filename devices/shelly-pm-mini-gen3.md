# Shelly PM Mini Gen3: wiring behind a socket

A small power meter for the wall box (model S3PM-001PCEU16). It sits in series with a socket's phase
and only measures: power, voltage, current and energy of what is plugged in. It does not switch.
Home Assistant reads it locally through the core `shelly` integration, without a cloud account.
In DomoSenso it is the `mains-meter` behind the music player: map its power and voltage sensors to
Ramka's `mains` input and the now-playing view shows the player's draw and voltage.
Device file: [shelly-pm-mini-gen3.yaml](shelly-pm-mini-gen3.yaml).

## Wiring

![Shelly PM Mini Gen3 in a socket's wall box: the supply and onward phase meet in connector L, lead A goes to Shelly L, lead B from Shelly O to the socket's L; connector N feeds the socket's N (lead C) and Shelly N (lead D); the onward N and both PE stay in the socket](wiring/shelly-pm-mini-gen3-socket.svg)

| lead | from | to |
|---|---|---|
| A | connector L (supply phase, onward phase) | Shelly L |
| B | Shelly O | socket L |
| C | connector N (supply neutral) | socket N |
| D | connector N | Shelly N |

- The onward phase, to the next socket on the circuit, joins in connector L, before the meter. Only
  what is plugged into this socket is measured; the next sockets are not.
- The onward neutral and both protective earths stay in the socket insert, as before.
- The two O terminals on the case are bridged inside; one is enough.
- Leads: short pieces of the supply's cross-section. The Shelly's screw terminals take 0.5 to 4 mm²,
  stripped 6 to 7 mm, at 0.4 Nm; the circuit breaker must be type B or C, 16 A at most (Shelly's
  specification). The connectors take the strip length printed on them.
- This is the wiring of the first home's meter, behind a multiple socket with a three-way lever
  connector for each of L and N. A socket with a switched outlet or a different terminal layout
  needs its own plan.

## Safety

Mains work. Switch off the circuit breaker and prove 0 V on L and N at the socket before touching a
wire. Have it done by a qualified electrician, or only as far as your local rules allow you to do it
yourself; some countries require an inspection afterwards. The drawing explains the connection, it
is not an installation approval.

## In Home Assistant

The `shelly` integration discovers the meter on the network. Check that the power and voltage
sensors update while the player is playing and in standby. The catalog recognises the meter by the
integration and a model name containing PM Mini (`domosenso recommend --from-ha`).

## Limits

One meter has been tested, in one home, behind one amplifier. Other metering Shelly models are
reported as likely mains meters, not as indexed devices.

## References

- [Shelly PM Mini Gen3 — Shelly knowledge base](https://kb.shelly.cloud/knowledge-base/shelly-pm-mini-gen3)
- [Shelly — Home Assistant](https://www.home-assistant.io/integrations/shelly/)
