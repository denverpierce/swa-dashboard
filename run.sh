#!/bin/bash
rm -f ./logs/info.log
rm -f ./log/error.log
npm run check > ./logs/info.log 2> ./logs/error.log
