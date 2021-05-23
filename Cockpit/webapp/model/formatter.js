sap.ui.define([
	"../controller/BaseController",
	"sap/ui/core/format/DateFormat"
], function (BaseController, DateFormat) {
	"use strict";

	return {

		currencyValue: function (sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(2);
		},

		numberUnit: function (sValue) {
			if (!sValue) {
				return "0.00";
			}
			return parseFloat(sValue).toFixed(3);
		},

		numberProduct: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(sValue1 * sValue2).toFixed(3);
		},

		numberProductForActualSubCost: function (sPrice, sCumulativeQuantity, sPlannedQuantity, bLumpSum) {
			if (!sPrice || !sCumulativeQuantity || !sPlannedQuantity) {
				return "";
			}
			if (bLumpSum) {
				return parseFloat(sPrice * sPlannedQuantity).toFixed(3);
			} else {
				return parseFloat(sPrice * sCumulativeQuantity).toFixed(3);
			}
		},

		numberDivision: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(Number(sValue1) / Number(sValue2)).toFixed(3);
		},

		actualOfTotal: function (sActualQuantity, sText, sPlannedQuantity) {
			if (!sActualQuantity) {
				return sPlannedQuantity;
			} else {
				return sActualQuantity + " " + sText + " " + sPlannedQuantity;
			}
		},

		earnedValueKPI: function (actQuant, planQuant, actCost, planCost) {
			var EV = Number(actQuant) / Number(planQuant) * Number(planCost);
			if (isNaN(EV) || !actCost) {
				return "";
			}
			return parseFloat(EV / Number(actCost)).toFixed(3);
		},

		taskTooltipFormatter: function (iStatus, oPlannedStart, oActualStart, oEstimatedEnd, iWait) {
			var oDateFormat = DateFormat.getDateTimeInstance({
					style: "short"
				}),
				sTooltip = "";

			// StartDate
			if (iStatus > 1) {
				sTooltip += oDateFormat.format(oActualStart, false, false);
			} else {
				sTooltip += oDateFormat.format(oPlannedStart, false, false);
			}
			// EndDate
			sTooltip += " - ";
			sTooltip += oDateFormat.format(oEstimatedEnd, false, false);
			// wait time
			sTooltip += iWait ? " --> " + oDateFormat.format(new Date(oEstimatedEnd.getTime() + iWait), false, false) + "\n" : "\n";

			return sTooltip;
		},

		startStopIconFormatter: function (iStatus) {
			var sIcon = "";
			if (iStatus === 2) {
				sIcon = "sap-icon://stop";
			} else if (iStatus === 3) {
				sIcon = "sap-icon://restart";
			}
			return sIcon;
		},

		startStopButtonTooltip: function (iStatus) {
			var sText = "";
			if (iStatus === 2) {
				sText = this.getResourceBundle().getText("stopTaskTooltip");
			} else if (iStatus === 3) {
				sText = this.getResourceBundle().getText("restartTaskTooltip");
			}
			return sText;
		},

		statusButtonText: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = this.getResourceBundle().getText("buttonCommit");
				break;
			case 1: // committed
				sText = this.getResourceBundle().getText("buttonStart");
				break;
			case 2: // started
				sText = this.getResourceBundle().getText("buttonComplete");
				break;
			case 3: // stopped
				sText = this.getResourceBundle().getText("buttonComplete");
				break;
			case 4: // completed
				sText = this.getResourceBundle().getText("buttonApprove");
				break;
			case 5: // approved
				sText = this.getResourceBundle().getText("buttoonApproved");
				break;
			}
			return sText;
		},

		statusButtonTooltip: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = this.getResourceBundle().getText("committedButtonTooltip");
				break;
			case 1: // committed
				sText = this.getResourceBundle().getText("startButtonTooltip");
				break;
			case 2: // started
				sText = this.getResourceBundle().getText("completeButtonTooltip");
				break;
			case 3: // stopped
				sText = this.getResourceBundle().getText("completeButtonTooltip");
				break;
			case 4: // completed
				sText = this.getResourceBundle().getText("approveButtonTooltip");
				break;
			}
			return sText;
		},

		progress: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(sValue1 / sValue2 * 100).toFixed(2);
		},

		stateFormatter: function (KPI) {
			if (KPI === "") {
				return "None";
			}
			if (!KPI) {
				return "None";
			}
			if (KPI >= 1.0) {
				return "Success";
			} else if (KPI >= 0.9) {
				return "Warning";
			} else {
				return "Error";
			}
		},

		quantityStateFormatter: function (actualQuantity, plannedQuantity) {
			var sState = "None";
			if (!actualQuantity || !plannedQuantity || plannedQuantity === 0) {
				return sState;
			}
			sState = (actualQuantity / plannedQuantity) > 1 ? "Success" : "None";
			sState = (actualQuantity / plannedQuantity) < 1 ? "Error" : "None";
			return sState;
		},

		CPIStateFormatter: function (actQuant, planQuant, actCost, planCost) {
			// "Cost" can also be quantity of a resource
			var CPI = actQuant / planQuant * planCost / actCost;
			if (isNaN(CPI)) {
				return "None";
			}
			if (CPI < 0.9) {
				return "Error";
			}
			if (CPI < 1.0) {
				return "Warning";
			}
			return "Success";
		},

		CPIIconFormatter: function (actQuant, planQuant, actCost, planCost) {
			// "Cost" can also be quantity of a resource
			var CPI = actQuant / planQuant * planCost / actCost;
			if (isNaN(CPI)) {
				return "Neutral";
			}
			if (CPI < 0.9) {
				return "Negative";
			}
			if (CPI < 1.0) {
				return "Critical";
			}
			return "Positiv";
		},

		selectProgressStateFormatter: function (sKPI) {
			if (sKPI === "") {
				return "None";
			}
			if (sKPI < 0.9) {
				return "Error";
			} else if (sKPI >= 1.0) {
				return "Success";
			} else {
				return "Warning";
			}
		},

		taskIconFormatter: function (iStatus) {
			var mIcon = "";
			switch (iStatus) {
				// case 0: planned - no icon
			case 1: // committed
				mIcon = "sap-icon://navigation-right-arrow";
				break;
			case 2: // started
				mIcon = "sap-icon://process";
				break;
			case 3: // stopped
				mIcon = "sap-icon://stop";
				break;
			case 4: // completed
				mIcon = "sap-icon://media-forward";
				break;
			case 5: // approved
				mIcon = "sap-icon://accept";
				break;
			}
			return mIcon;
		},

		iconFormatter: function (KPI) {
			if (KPI >= 1.0) {
				return "sap-icon://status-positive";
			} else if (KPI >= 0.9) {
				return "sap-icon://status-critical";
			} else {
				return "sap-icon://status-negative";
			}
		},

		statusTextFormatter: function (iStatus) {
			switch (iStatus) {
			case 0:
				return this.getResourceBundle().getText("statusPlanned");
			case 1:
				return this.getResourceBundle().getText("statusCommitted");
			case 2: // started
				return this.getResourceBundle().getText("statusStarted");
			case 3: // stopped
				return this.getResourceBundle().getText("statusStopped");
			case 4: // completed
				return this.getResourceBundle().getText("statusCompleted");
			case 5: // approved
				return this.getResourceBundle().getText("statusApproved");
			}
			return "";
		},

		plannedNetDuration: function (quantity, plannedProductivity, productivityFactor) {
			var sHours = String(quantity / (plannedProductivity * productivityFactor)),
				//sReturn = this.hoursToHoursMinutes(sNetDurationHours); not found ???
				decimalTime = parseFloat(sHours);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		currentNetDuration: function (quantity, currentProductivity) {
			var sHours = String(quantity / currentProductivity),
				decimalTime = parseFloat(sHours);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		hoursToHoursMinutes: function (sHours) {
			var decimalTime = parseFloat(sHours);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		hoursMinutesToDecimalHours: function (sHoursMinutes) {
			var sHours = sHoursMinutes.slice(0, sHoursMinutes.indexOf(":")),
				sMinutes = sHoursMinutes.slice(sHoursMinutes.indexOf(":") + 1, sHoursMinutes.length);
			return parseFloat(Number(sHours) + Number(sMinutes) / 60).toFixed(3);
		},

		startDate: function (sStatus, sPlannedStart, sActualStart) {
			if (sStatus > 1) {
				return new Date(sActualStart);
			}
			return new Date(sPlannedStart);
		},

		startDateString: function (sStatus, sPlannedStart, sActualStart) {
			var oDateFormat = DateFormat.getDateTimeInstance({
				style: "short"
			});
			if (sStatus > 1) {
				return oDateFormat.format(new Date(sActualStart), false, false);
			}
			return oDateFormat.format(new Date(sPlannedStart), false, false);
		},

		endDate: function (sStatus, sPlannedEnd, sEstimatedEnd, sWait) {
			var iWait = sWait ? sWait : 0;
			if (!this.getModel("appView").getProperty("/incWait")) {
				iWait = 0;
			}
			if (sStatus > 1) {
				return new Date(sEstimatedEnd.getTime() + iWait);
			}
			return new Date(sPlannedEnd.getTime() + iWait);
		},

		endDateString: function (sStatus, sPlannedEnd, sEstimatedEnd, sWait) {
			var oDateFormat = DateFormat.getDateTimeInstance({
					style: "short"
				}),
				iWait = sWait ? sWait : 0;
			if (!this.getModel("appView").getProperty("/incWait")) {
				iWait = 0;
			}
			if (sStatus > 1) {
				return oDateFormat.format(new Date(sEstimatedEnd.getTime() + iWait), false, false);
			}
			return oDateFormat.format(new Date(sPlannedEnd.getTime() + iWait), false, false);
		},

		stopDurationTillNow: function (iStopDurationMs, oStoppedAt, iStatus) {
			var iStopDurationMs2 = iStopDurationMs;
			if (iStatus === 3) { // stopped - add the time from oStoppedAt until now
				var oNow = new Date();
				iStopDurationMs2 += oNow.getTime() - oStoppedAt.getTime();
			}
			var decimalTime = parseFloat(iStopDurationMs2 / 60 / 60 / 1000);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		dhmFromMs: function (iMs) {
			var cd = 24 * 60 * 60 * 1000,
				ch = 60 * 60 * 1000,
				d = Math.floor(iMs / cd),
				h = Math.floor((iMs - d * cd) / ch),
				m = Math.round((iMs - d * cd - h * ch) / 60000),
				pad = function (n) {
					return n < 10 ? "0" + n : n;
				};
			if (!iMs || iMs === 0) {
				return ["0", "00", "00"];
			}
			if (m === 60) {
				h++;
				m = 0;
			}
			if (h === 24) {
				d++;
				h = 0;
			}
			return [d, pad(h), pad(m)];
		},

		dhmFromMsAsString: function (iMs) {
			var cd = 24 * 60 * 60 * 1000,
				ch = 60 * 60 * 1000,
				d = Math.floor(iMs / cd),
				h = Math.floor((iMs - d * cd) / ch),
				m = Math.round((iMs - d * cd - h * ch) / 60000),
				pad = function (n) {
					return n < 10 ? "0" + n : n;
				};
			if (!iMs || iMs === 0) {
				return "00:00:00";
			}
			if (m === 60) {
				h++;
				m = 0;
			}
			if (h === 24) {
				d++;
				h = 0;
			}
			return [d, pad(h), pad(m)].join(":");
		},

		dhmFromMsAsStringOrNull: function (iMs) {
			var cd = 24 * 60 * 60 * 1000,
				ch = 60 * 60 * 1000,
				d = Math.floor(iMs / cd),
				h = Math.floor((iMs - d * cd) / ch),
				m = Math.round((iMs - d * cd - h * ch) / 60000),
				pad = function (n) {
					return n < 10 ? "0" + n : n;
				};
			if (!iMs || iMs === 0) {
				return "";
			}
			if (m === 60) {
				h++;
				m = 0;
			}
			if (h === 24) {
				d++;
				h = 0;
			}
			return this.getResourceBundle().getText("waitingDuration") + " " + [d, pad(h), pad(m)].join(":");
		},

		labourHoursPerUoM: function (sHours, sQuantity) {
			if (!sHours || !sQuantity) {
				return "";
			}
			var decimalTime = Number(sHours) / Number(sQuantity);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		labourCostPerUoM: function (sTotalCost, sQuantity) {
			if (!sTotalCost || !sQuantity || sQuantity === 0) {
				return "";
			}
			var sUnitCost = parseFloat(sTotalCost / sQuantity).toFixed(2);
			return sUnitCost;
		}
	};
});