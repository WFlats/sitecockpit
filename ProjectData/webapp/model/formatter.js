sap.ui.define([], function () {
	"use strict";

	return {

		currencyValue: function (sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(2);
		},

		threeDecimals: function (sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(3);
		},

		statusTextFormatter: function (iStatus) {
			switch (iStatus) {
			case 0:
				return "Planned";
			case 1:
				return "Started";
			case 2:
				return "Completed";
			}
			return "";
		},

		stateFormatter: function (iStatus) {
			switch (iStatus) {
			case 0:
				return "None";
			case 1:
				return "Warning";
			case 2:
				return "Success";
			}
			return "None";
		},

		statusButtonText: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = "Start";
				break;
			case 1: // committed
				sText = "Complete";
				break;
			}
			return sText;
		},

		statusButtonTooltip: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = "Set status to Started";
				break;
			case 1: // committed
				sText = "Set status to Completed";
				break;
			}
			return sText;
		},

		timeFormatter: function (iHours, iMins) {
			var sHours = String(iHours),
				sMins = String(iMins);
			if (sHours < 10) {
				sHours = "0" + sHours;
			}
			if (sMins < 10) {
				sMins = "0" + sMins;
			}
			return sHours + ":" + sMins;
		}
	};
});