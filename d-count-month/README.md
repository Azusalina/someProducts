# Count Month

## What is it?

A minimal, phone-friendly month-counting game for accounting students. Earn
credits and trophies by counting periods and splitting them by financial year.
See [description.md](description.md) for the rules and technical details.

## How to use

Open [Count Month](https://azusalina.github.io/someProducts/count-month/) in a
modern phone or desktop browser. No installation or account is needed.

Count both the first and last month. Use the keypad and Submit. For periods over
12 months, enter one term per financial year in chronological order, such as
`6+12+4`. Each correct question earns one credit; Next question continues.
Wrong answers allow another attempt without losing credits.

Settings chooses a financial-year starting month and a maximum duration of up
to five years. Calculator opens a basic calculator on the right. Desktop users
can also type digits, `+`, Backspace, Delete and Enter.

Trophies unlock at 10, 25, 50, 100, 250 and 500 credits. Progress is saved in this
browser. To reset it, open Settings → Developer mode, enter `0000`, unlock,
then select Reset credits & trophies and Confirm reset.

For local use, run `python3 -m http.server 5500 --bind 127.0.0.1` from this folder
and open `http://127.0.0.1:5500/`. Python 3 is only needed for this local server.
