sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/base/Log",
	"cockpit/Cockpit/model/formatter"
], function (Controller, Filter, FilterOperator, Sorter, MessageBox, MessageToast, History, JSONModel, Log, formatter) {
	"use strict";

	return Controller.extend("cockpit.Cockpit.controller.BaseController", {

		formatter: formatter,

		/**
		 * Convenience method for accessing the router in every controller of the application.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return this.getOwnerComponent().getRouter();
		},

		/**
		 * Convenience method for getting the view model by name in every controller of the application.
		 * @public
		 * @param {string} sName the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model in every controller of the application.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Convenience method for getting the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will replace the current entry of the browser history with the master route.
		 * @public
		 */
		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// eslint-disable-next-line sap-no-history-manipulation
				history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		/////////////////////////////////////////// SET USER MODEL AND STORE LOGIN INFO ///////////////////////////////

		getUserInfo: function (sAppName, sRole, sProjectCode) {
			var oModel = this.getModel(),
				oUserModel = this.getModel("userModel"),
				oLogin = {};

			oUserModel.setProperty("/app", sAppName);
			oUserModel.setProperty("/role", sRole);
			oUserModel.setProperty("/projectCode", sProjectCode);
			oLogin.app = sAppName;
			oLogin.role = sRole;
			oLogin.projectCode = sProjectCode;
			oModel.create("/Logins", oLogin, {
				success: function (oData) {
					if (oData && oData.createdBy) {
						oUserModel.setProperty("/email", oData.createdBy);
					}
				}
			});
		},

		/////////////////////////////////////////// NET AND GROSS DATES HELPER FUNCTIONS //////////////////////////////

		// routines are working with oWorkTimeModel! I.e. oShift is a JSON model with its shiftParts
		// when date vars are equaled to function parameters they change with the vars! 
		// therefore var = new Date(param.getTime))) is used

		adjustUTC: function (oDate) {
			// adds the time zone offset to the hours; result is same time as UTC but in local time zone
			if (oDate) {
				return new Date(Date.UTC(oDate.getFullYear(), oDate.getMonth(), oDate.getDate(), oDate.getHours(), oDate.getMinutes(), oDate.getSeconds()));
			} else {
				return undefined;
			}
		},

		getShiftFromID: function (sShiftID) {
			var oWorkTimeModel = this.getModel("workTimeModel"),
				aShifts = oWorkTimeModel.getProperty("/shifts");
			return aShifts.find(function (oShift) {
				return oShift.ID === sShiftID;
			});
		},

		inShift: function (oDate, oShift) {
			var oCurrentHrs = oDate.getHours() + oDate.getMinutes() / 60,
				shiftStartHrs = Number(oShift.shiftParts[0].startTimeHrs) + Number(oShift.shiftParts[0].startTimeMins) / 60,
				shiftEndHrs = Number(oShift.shiftParts[oShift.shiftParts.length - 1].endTimeHrs) + Number(oShift.shiftParts[oShift.shiftParts.length -
					1].endTimeMins) / 60;

			if (this.isWeekendDay(oDate) && !oShift.ignoreWeekends) {
				return false;
			}
			if (this.isSpecialDate(oDate) && !oShift.ignoreHolidays) {
				return false;
			}
			return (oCurrentHrs >= shiftStartHrs && oCurrentHrs <= shiftEndHrs);
		},

		getShiftEnd: function (oDate, oShift) { // returns end of current shift
			var oShiftEndDate = new Date(oDate.getTime()),
				oLastShiftPart = oShift.shiftParts[oShift.shiftParts.length - 1];
			oShiftEndDate.setHours(oLastShiftPart.endTimeHrs);
			oShiftEndDate.setMinutes(oLastShiftPart.endTimeMins, 0, 0);
			return oShiftEndDate;
		},

		getShiftStart: function (oDate, oShift) { // returns start of current shift
			var oShiftStartDate = new Date(oDate.getTime()),
				oFirstShiftPart = oShift.shiftParts[0];
			oShiftStartDate.setHours(oFirstShiftPart.startTimeHrs);
			oShiftStartDate.setMinutes(oFirstShiftPart.startTimeMins, 0, 0);
			return oShiftStartDate;
		},

		nextWorkingTime: function (oDate, oShift) { // finds the next time to work
			var oNextWorkTime = new Date(oDate.getTime()),
				iShiftPartIndex = this.getShiftPartIndexFromDate(oDate, oShift);

			if (this.inShift(oDate, oShift)) {
				// if in break time, move to next shiftPart start
				if (oShift.shiftParts[iShiftPartIndex].breakTime) {
					oNextWorkTime.setHours(Number(oShift.shiftParts[iShiftPartIndex + 1].startTimeHrs));
					oNextWorkTime.setMinutes(Number(oShift.shiftParts[iShiftPartIndex + 1].startTimeMins));
				}
			} else {
				oNextWorkTime = this.getNextShiftStart(oDate, oShift);
			}
			return oNextWorkTime;
		},

		previousWorkingTime: function (oDate, oShift) { // finds the previous time to work
			var oPreviousWorkTime = new Date(oDate.getTime()),
				iShiftPartIndex = this.getShiftPartIndexFromDate(oDate, oShift);

			if (this.inShift(oDate, oShift)) {
				// if in break time, move to previous shiftPart end
				if (oShift.shiftParts[iShiftPartIndex].breakTime) {
					oPreviousWorkTime.setHours(Number(oShift.shiftParts[iShiftPartIndex - 1].endTimeHrs));
					oPreviousWorkTime.setMinutes(Number(oShift.shiftParts[iShiftPartIndex - 1].endTimeMins));
				}
			} else {
				oPreviousWorkTime = this.getPreviousShiftEnd(oDate, oShift);
			}
			return oPreviousWorkTime;
		},

		getDecimalHours: function (sHours, sMinutes) {
			return sHours + sMinutes / 60;
		},

		getNetDurationHours: function (mQuantity, mProductivity) {
			var mDurationHours = mQuantity / mProductivity;
			return mDurationHours;
		},

		getNetDurationHoursFromDates: function (oStartDate, oEndDate, oShift) {
			var oCurrentTime = new Date(oStartDate.getTime()),
				oAdjustedEndDate = new Date(oEndDate.getTime()),
				mNetDuration = 0,
				mRemainingShiftPartHours = 0,
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift),
				iMsPerHour = 60 * 60 * 1000;
			// oStartDate should be within a shift; for safety show a message
			if (isNaN(iCurrentShiftPartIndex)) {
				MessageToast.show("getNetduration: Start date is not in shift!");
				return mNetDuration;
			}
			// if oEndDate is not in shift, adjust it to the end of the last shift
			// this happens e.g. when a task is started/stopped outside of shifts
			if (!this.inShift(oAdjustedEndDate, oShift)) {
				oAdjustedEndDate = this.getShiftEnd(oEndDate, oShift);
			}
			while (oCurrentTime.getTime() < oAdjustedEndDate.getTime()) {
				if (!oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { // skip breaks
					mRemainingShiftPartHours = this.getRemainingDurationHoursOfShiftPart(oCurrentTime, oShift.shiftParts[iCurrentShiftPartIndex]);
					if (oAdjustedEndDate.getTime() < oCurrentTime.getTime() + mRemainingShiftPartHours * iMsPerHour) {
						// ends in current shiftPart
						mNetDuration += (oAdjustedEndDate.getTime() - oCurrentTime.getTime()) / iMsPerHour;
						oCurrentTime = oAdjustedEndDate;
						break;
					} else {
						// add the shiftPart duration
						mNetDuration += mRemainingShiftPartHours; // revisit: could be next day
					}
				}
				// take next shiftPart
				iCurrentShiftPartIndex += 1;
				if (iCurrentShiftPartIndex >= oShift.shiftParts.length) {
					iCurrentShiftPartIndex = 0;
					oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				} else {
					oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].startTimeHrs);
					oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].startTimeMins);
				}
			}
			return mNetDuration;
		},

		isWeekendDay: function (oDate) {
			var aWeekendDays = this.getModel("workTimeModel").getProperty("/weekendDays");
			if (aWeekendDays.includes(oDate.getDay())) {
				return true;
			} else {
				return false;
			}
		},

		isSpecialDate: function (oDate) {
			var aSpecialDates = this.getModel("workTimeModel").getProperty("/specialDates"),
				bIsSpecialDate = false;
			for (var i = 0; i < aSpecialDates.length; i++) {
				if (aSpecialDates[i].startDate.getFullYear() === oDate.getFullYear() && aSpecialDates[i].startDate.getMonth() === oDate.getMonth() &&
					aSpecialDates[i].startDate.getDate() === oDate.getDate()) {
					bIsSpecialDate = true;
					break;
				}
			}
			return bIsSpecialDate;
		},

		isShiftStart: function (oDate, oShift) {
			if (oShift.shiftParts[0].startTimeHrs === oDate.getHours() &&
				oShift.shiftParts[0].startTimeMins === oDate.getMinutes()) {
				return true;
			}
			return false;
		},

		isShiftEnd: function (oDate, oShift) {
			if (oShift.shiftParts[oShift.shiftParts.length - 1].endTimeHrs === oDate.getHours() &&
				oShift.shiftParts[oShift.shiftParts.length - 1].endTimeMins === oDate.getMinutes()) {
				return true;
			}
			return false;
		},

		isShiftPartStart: function (oDate, oShiftPart) {
			if (oDate.getHours() === oShiftPart.startTimeHrs && oDate.getMinutes() === oShiftPart.startTimeMins) {
				return true;
			}
			return false;
		},

		isShiftPartEnd: function (oDate, oShiftPart) {
			if (oDate.getHours() === oShiftPart.endTimeHrs && oDate.getMinutes() === oShiftPart.endTimeMins) {
				return true;
			}
			return false;
		},

		getNextWorkingDay: function (oDate, oShift) {
			var bWorkingDay = false,
				oNextWorkingDay = new Date(oDate.getTime());

			while (!bWorkingDay) {
				oNextWorkingDay.setDate(oNextWorkingDay.getDate() + 1);
				if (this.isWeekendDay(oNextWorkingDay)) {
					if (oShift.ignoreWeekends) {
						bWorkingDay = true;
					}
				} else if (this.isSpecialDate(oNextWorkingDay)) {
					if (oShift.ignoreHolidays) {
						bWorkingDay = true;
					}
				} else { // working day
					bWorkingDay = true;
				}
			}
			return oNextWorkingDay;
		},

		getPreviousWorkingDay: function (oDate, oShift) {
			var bWorkingDay = false,
				oPreviousWorkingDay = new Date(oDate.getTime());

			while (!bWorkingDay) {
				oPreviousWorkingDay.setDate(oPreviousWorkingDay.getDate() - 1);
				if (this.isWeekendDay(oPreviousWorkingDay)) {
					if (oShift.ignoreWeekends) {
						bWorkingDay = true;
					}
				} else if (this.isSpecialDate(oPreviousWorkingDay)) {
					if (oShift.ignoreHolidays) {
						bWorkingDay = true;
					}
				} else { // working day
					bWorkingDay = true;
				}
			}
			return oPreviousWorkingDay;
		},

		getShiftPartIndexFromDate: function (oDate, oShift) {
			var mDateHours = this.getDecimalHours(oDate.getHours(), oDate.getMinutes()),
				mShiftStartHours,
				mShiftEndHours,
				iShiftPartIndex;
			// Attention: end of shiftPart and start of next shiftPart have equal times
			// if oDate is at shiftPart start/end it finds the earlier shiftPart
			// shiftPartIndex might have to be corrected
			for (var i = 0; i < oShift.shiftParts.length; i++) {
				mShiftStartHours = this.getDecimalHours(oShift.shiftParts[i].startTimeHrs, oShift.shiftParts[i].startTimeMins);
				mShiftEndHours = this.getDecimalHours(oShift.shiftParts[i].endTimeHrs, oShift.shiftParts[i].endTimeMins);
				if (mDateHours >= mShiftStartHours && mDateHours <= mShiftEndHours) {
					iShiftPartIndex = i;
					break;
				}
			}
			return iShiftPartIndex;
		},

		getNextShiftStart: function (oDate, oShift) {
			var mShiftStartHours = this.getDecimalHours(oShift.shiftParts[0].startTimeHrs, oShift.shiftParts[0].startTimeMins),
				mCurrentHours = this.getDecimalHours(oDate.getHours(), oDate.getMinutes()),
				oNextShiftStartDate = new Date(oDate.getTime());

			if (mShiftStartHours <= mCurrentHours || // shift starts next working day
				(!oShift.ignoreWeekends && this.isWeekendDay(oNextShiftStartDate)) ||
				(!oShift.ignoreHolidays && this.isSpecialDate(oNextShiftStartDate))) {
				oNextShiftStartDate = new Date(this.getNextWorkingDay(oNextShiftStartDate, oShift));
			}
			oNextShiftStartDate.setHours(oShift.shiftParts[0].startTimeHrs);
			oNextShiftStartDate.setMinutes(oShift.shiftParts[0].startTimeMins);
			oNextShiftStartDate.setSeconds(0, 0);
			return oNextShiftStartDate;
		},

		getPreviousShiftEnd: function (oDate, oShift) {
			var mShiftEndHours = this.getDecimalHours(oShift.shiftParts[oShift.shiftParts.length - 1].endTimeHrs,
					oShift.shiftParts[oShift.shiftParts.length - 1].endTimeMins),
				mCurrentHours = this.getDecimalHours(oDate.getHours(), oDate.getMinutes()),
				oPreviousShiftEndDate = new Date(oDate.getTime());

			if (mShiftEndHours >= mCurrentHours || // shift starts previous working day
				(!oShift.ignoreWeekends && this.isWeekendDay(oPreviousShiftEndDate)) ||
				(!oShift.ignoreHolidays && this.isSpecialDate(oPreviousShiftEndDate))) {
				oPreviousShiftEndDate = new Date(this.getPreviousWorkingDay(oPreviousShiftEndDate, oShift));
			}
			oPreviousShiftEndDate.setHours(oShift.shiftParts[oShift.shiftParts.length - 1].endTimeHrs);
			oPreviousShiftEndDate.setMinutes(oShift.shiftParts[oShift.shiftParts.length - 1].endTimeMins);
			oPreviousShiftEndDate.setSeconds(0, 0);
			return oPreviousShiftEndDate;
		},

		getRemainingDurationHoursOfShiftPart: function (oCurrentTime, oShiftPart) {
			var mStartHours = this.getDecimalHours(oCurrentTime.getHours(), oCurrentTime.getMinutes()),
				mEndHours = this.getDecimalHours(oShiftPart.endTimeHrs, oShiftPart.endTimeMins);

			if (mEndHours < mStartHours) { // shiftPart stretches over midnight
				mEndHours = mEndHours + 24;
			}
			return mEndHours - mStartHours;
		},

		getPullRemainingDurationHoursOfShiftPart: function (oCurrentTime, oShiftPart) {
			var mEndHours = this.getDecimalHours(oCurrentTime.getHours(), oCurrentTime.getMinutes()),
				mStartHours = this.getDecimalHours(oShiftPart.startTimeHrs, oShiftPart.startTimeMins);

			if (mEndHours < mStartHours) { // shiftPart stretches over midnight
				mEndHours = mEndHours - 24;
			}
			return mEndHours - mStartHours;
		},

		getStartDateInWorkingHours: function (oStartDate, oShift) {
			// just makes sure "oStartDate" is within a shift. I must not be the start date
			var oCurrentTime = new Date(oStartDate.getTime()),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift);

			if (!oShift.ignoreWeekends && this.isWeekendDay(oCurrentTime)) {
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				return oCurrentTime;
			}
			if (!oShift.ignoreHolidays && this.isSpecialDate(oCurrentTime)) {
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				return oCurrentTime;
			}
			if (isNaN(iCurrentShiftPartIndex)) { // currentTime is not in the shift
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				return oCurrentTime;
			}
			// if it's the end of the shiftPart but not the end of the shift, move to next shiftPart (time stays the same)
			// this makes sure that break times are not filled
			if (this.isShiftPartEnd(oCurrentTime, oShift.shiftParts[iCurrentShiftPartIndex]) &&
				!this.isShiftEnd(oCurrentTime, oShift)) {
				iCurrentShiftPartIndex += 1;
			}
			if (oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { //Break time - go to next shiftPart start
				iCurrentShiftPartIndex += 1;
				oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].startTimeHrs); // revisit: could be next day
				oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].startTimeMins);
			} else if (this.isShiftEnd(oCurrentTime, oShift)) {
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
			}
			return oCurrentTime;
		},

		getPullEndDateInWorkingHours: function (oEndDate, oShift) {
			// same as getStartDateInWorkingHours, just going back in the shiftParts
			var oCurrentTime = new Date(oEndDate.getTime()),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift);

			if (!oShift.ignoreWeekends && this.isWeekendDay(oCurrentTime)) {
				oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
				return oCurrentTime;
			}
			if (!oShift.ignoreHolidays && this.isSpecialDate(oCurrentTime)) {
				oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
				return oCurrentTime;
			}
			if (isNaN(iCurrentShiftPartIndex)) { // currentTime is not in the shift
				oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
				return oCurrentTime;
			}
			// if it's the start of the shiftPart but not the start of the shift, move to previous shiftPart (time stays the same)
			// this makes sure that break times are not filled
			if (this.isShiftPartStart(oCurrentTime, oShift.shiftParts[iCurrentShiftPartIndex]) &&
				!this.isShiftStart(oCurrentTime, oShift)) {
				iCurrentShiftPartIndex -= 1;
			}
			if (oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { //Break time - go to previous shiftPart end
				iCurrentShiftPartIndex -= 1;
				oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].endTimeHrs); // revisit: could be previous day?
				oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].endTimeMins);
			} else if (this.isShiftStart(oCurrentTime, oShift)) {
				oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
			}
			return oCurrentTime;
		},

		getEndDateInWorkingHours: function (oStartDate, mQuantity, mProductivity, oShift) {
			// getEndDateInWorkingHours shall only be called for calculations into the future (no stop times taken into consideration)
			// also works for calculating remaining duration after new measurement or after re-start
			// in these cases oStartDate is the date from which the rest of the work is calculated and
			// mQuantity is the remaining quantity, mProductivity is the currentProductivity
			var mNetDurationHours = this.getNetDurationHours(mQuantity, mProductivity),
				mRemainingDurationHours = mNetDurationHours,
				oCurrentTime = new Date(oStartDate.getTime()),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift),
				mRemainingShiftPartHours,
				iMsPerHour = 60 * 60 * 1000;

			if (isNaN(iCurrentShiftPartIndex)) { // currentTime is not in the shift
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				iCurrentShiftPartIndex = 0;
			}
			while (mRemainingDurationHours > 0) {
				if (!oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { // skip breaks
					mRemainingShiftPartHours = this.getRemainingDurationHoursOfShiftPart(oCurrentTime, oShift.shiftParts[iCurrentShiftPartIndex]);
					if (mRemainingShiftPartHours >= mRemainingDurationHours) {
						// ends in current shiftPart
						oCurrentTime = new Date(oCurrentTime.getTime() + mRemainingDurationHours * iMsPerHour);
						mRemainingDurationHours = 0;
						break;
					} else {
						// deduct the rest of the shiftPart duration
						mRemainingDurationHours -= mRemainingShiftPartHours;
					}
				}
				// take next shiftPart
				iCurrentShiftPartIndex += 1;
				if (iCurrentShiftPartIndex >= oShift.shiftParts.length) {
					iCurrentShiftPartIndex = 0;
					oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				} else {
					oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].startTimeHrs);
					oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].startTimeMins);
				}
			}
			/*			if (this.isShiftEnd(oCurrentTime, oShift)) {
							oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
						} */
			return oCurrentTime;
		},

		getPullStartDateInWorkingHours: function (oEndDate, mQuantity, mProductivity, oShift) {
			// getPullStartDateInWorkingHours is used only for PULL PLANNING (from the end date to the start date; not execution)
			var mNetDurationHours = this.getNetDurationHours(mQuantity, mProductivity),
				mRemainingDurationHours = mNetDurationHours,
				oCurrentTime = new Date(oEndDate.getTime()),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift),
				mRemainingShiftPartHours,
				iMsPerHour = 60 * 60 * 1000;

			if (isNaN(iCurrentShiftPartIndex)) { // currentTime is not in the shift
				oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
				iCurrentShiftPartIndex = oShift.shiftParts.length - 1;
			}
			while (mRemainingDurationHours > 0) {
				if (!oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { // skip breaks
					mRemainingShiftPartHours = this.getPullRemainingDurationHoursOfShiftPart(oCurrentTime, oShift.shiftParts[iCurrentShiftPartIndex]);
					if (mRemainingShiftPartHours >= mRemainingDurationHours) {
						// ends in current shiftPart
						oCurrentTime = new Date(oCurrentTime.getTime() - mRemainingDurationHours * iMsPerHour);
						mRemainingDurationHours = 0;
						break;
					} else {
						// deduct the rest of the shiftPart duration
						mRemainingDurationHours -= mRemainingShiftPartHours;
					}
				}
				// take previous shiftPart
				iCurrentShiftPartIndex -= 1;
				if (iCurrentShiftPartIndex < 0) { // take previous shift
					iCurrentShiftPartIndex = oShift.shiftParts.length - 1;
					oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
				} else {
					oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].endTimeHrs);
					oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].endTimeMins);
				}
			}
			/*			if (this.isShiftStart(oCurrentTime, oShift)) {
							oCurrentTime = this.getPreviousShiftEnd(oCurrentTime, oShift);
						} */
			return oCurrentTime;
		},

		getFutureDateInWorkingHours: function (oStartDate, mHours, oShift) {
			// misuse getEndDateInWorkingHours to find the start date in mHours time
			// but when it is shift end or start of break then skip forward
			var oFutureDate = new Date(this.getEndDateInWorkingHours(oStartDate, mHours, 1, oShift)),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oFutureDate, oShift);
			if (this.isShiftEnd(oFutureDate, oShift)) {
				return this.getNextShiftStart(oFutureDate, oShift);
			}
			if (this.isShiftPartEnd(oFutureDate, oShift.shiftParts[iCurrentShiftPartIndex])) {
				if (oShift.shiftParts[iCurrentShiftPartIndex + 1].breakTime) {
					oFutureDate.setHours(oShift.shiftParts[iCurrentShiftPartIndex + 2].startTimeHrs);
					oFutureDate.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex + 2].startTimeMins);
				}
			}
			return oFutureDate;
		},

		getPastDateInWorkingHours: function (oEndDate, mHours, oShift) {
			// misuse getPullStartDateInWorkingHours to find the end date in mHours time
			// but when it is shift start or end of break then skip backwards
			var oPastDate = this.getPullStartDateInWorkingHours(oEndDate, mHours, 1, oShift),
				iCurrentShiftPartIndex = this.getShiftPartIndexFromDate(oPastDate, oShift);
			if (this.isShiftStart(oPastDate, oShift)) {
				return this.getPreviousShiftEnd(oPastDate, oShift);
			}
			// iCurrentShiftPartIndex must be >=1 (no shiftStart);
			// if it is shiftPartEnd then iCurrentShiftPartIndex is in the break already 
			// because getShiftPartIndexFromDate dermines the index from start
			if (this.isShiftPartEnd(oPastDate, oShift.shiftParts[iCurrentShiftPartIndex])) {
				if (oShift.shiftParts[iCurrentShiftPartIndex].breakTime) {
					oPastDate.setHours(oShift.shiftParts[iCurrentShiftPartIndex - 1].endTimeHrs);
					oPastDate.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex - 1].endTimeMins);
				}
			}
			return oPastDate;
		},

		/////////////////////////////////////////// PROPAGATE ACTUAL DATA ////////////////////////////////////////////

		forwardActualProductivity: function (mProductivityFactor, mEndProductivityPercentage, sTaskName, oStart) {
			// oStart is the estimated end of the task that's productivity is to be promoted
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter = new Filter("project_ID", FilterOperator.EQ, sProjectID),
				oNow = new Date(),
				oDateFilter = (oNow.getTime() > oStart.getTime()) ? // make sure only future tasks are affected (not yet started)
				new Filter("plannedStart", FilterOperator.GE, oNow) : new Filter("plannedStart", FilterOperator.GE, oStart),
				oNameFilter = new Filter("taskName", FilterOperator.EQ, sTaskName),
				oStatusFilter = new Filter("status", FilterOperator.LT, 2),
				aFilters = [oProjectFilter, oDateFilter, oNameFilter, oStatusFilter],
				aTasksToModify,
				sPath,
				oBC,
				oEnd,
				mNewProductivityFactor,
				mProductivity,
				oShift,
				that = this;

			oModel.read("/Tasks", {
				filters: aFilters,
				and: true,
				success: function (oData) {
					if (oData.results && oData.results.length > 0) {
						aTasksToModify = oData.results;
						aTasksToModify.sort(function (a, b) {
							return a.plannedStart.getTime() - b.plannedStart.getTime();
						});
						aTasksToModify.forEach(function (oTask, index) {
							sPath = "/" + oModel.createKey("Tasks", {
								ID: oTask.ID
							});
							oBC = oModel.createBindingContext(sPath);
							// plannedProductivity stays unchanged; for planned durations the plannedProductivity * productivityFactor is used
							// mNewProductivityFactor is applied linearly
							mNewProductivityFactor = mProductivityFactor *
								(1 + (mEndProductivityPercentage * ((index + 1) / aTasksToModify.length)) / 100);
							oModel.setProperty("productivityFactor", parseFloat(mNewProductivityFactor).toFixed(3), oBC);
							// tasks not yet started have equal planned and current productivity
							oModel.setProperty("currentProductivity", parseFloat(mNewProductivityFactor * oTask.plannedProductivity).toFixed(3), oBC);
							mProductivity = oTask.plannedProductivity * mNewProductivityFactor;
							oShift = that.getShiftFromID(oTask.shift_ID);
							oEnd = that.getEndDateInWorkingHours(oTask.plannedStart, oTask.quantity, mProductivity, oShift);
							oModel.setProperty("plannedEnd", oEnd, oBC);
							oModel.setProperty("estimatedEnd", oEnd, oBC);
						});
						oModel.submitChanges({
							success: function (oSuccess) {
								MessageToast.show(aTasksToModify.length + " " + that.getResourceBundle().getText("msgProductivityPropagated"));
							},
							error: function (oErrorChange) {
								Log.error("Error updating planned productivity of tasks with name " + sTaskName + " " + JSON.stringify(oErrorChange));
							}
						});
					}
				},
				error: function (oError) {
					Log.error("Error reading tasks with name " + sTaskName + " " + JSON.stringify(oError));
				}
			});
		},

		/////////////////////////////////////////// FUNCTIONS FOR CLASHES ////////////////////////////////////////////

		getPreviousTask: function (oTask) {
			// oTask is the element, NOT the oData object
			var aTasks = oTask.getParent().getAppointments();

			if (aTasks.length < 2) {
				return undefined; // no previous task
			}
			// find the task with the start date closest to oTask.startDate
			// this will find a task that ended before as well as an overlapping task 
			aTasks.sort(function (a, b) { // sort descendent
				return b.getStartDate().getTime() - a.getStartDate().getTime();
			});
			for (var i = 0; i < aTasks.length; i++) {
				if (aTasks[i].getStartDate().getTime() < oTask.getStartDate().getTime()) {
					return aTasks[i]; // return previous task
				}
			}
			return undefined; // no previous task
		},

		getTasksOfRow: function (sRowID, sOwnID) {
			// reads from already loaded tasks only!
			var oModel = this.getModel(),
				sLocationPath = "/" + oModel.createKey("Locations", {
					ID: sRowID
				}),
				aLocationTasks = oModel.getObject(sLocationPath, { // data is already read; Tasks are in aLocationTasks.tasks
					select: "tasks/ID, tasks/plannedStart, tasks/actualStart, tasks/estimatedEnd, tasks/waitDuration, tasks/shortText",
					expand: "tasks"
				}),
				iMyTaskIndex = -1;
			aLocationTasks.tasks.find(function (oCompareTask, index) {
				if (oCompareTask.ID === sOwnID) {
					iMyTaskIndex = index;
					return true;
				} else {
					return false;
				}
			});
			if (iMyTaskIndex >= 0) { // remove the own task from array
				aLocationTasks.tasks.splice(iMyTaskIndex, 1);
			}
			return aLocationTasks.tasks || [];
		},

		getOverlappingTask: function (aTasks, oStart, oEnd, bPull) {
			// returns the first overlapping task
			// if there are more than one, it is the one before in push mode, the one after in pull mode
			var oTaskStart,
				oTaskEnd,
				aOverlappingTasks = [],
				oOverlappingTask,
				aStart,
				bStart;
			if (aTasks.length === 0) {
				return undefined;
			}
			// find all overlapping tasks
			aTasks.forEach(function (oValue) {
				oTaskStart = oValue.actualStart ? oValue.actualStart : oValue.plannedStart;
				oTaskEnd = oValue.waitDuration ? new Date(oValue.estimatedEnd.getTime() + oValue.waitDuration) : oValue.estimatedEnd;
				if (oTaskStart.getTime() < oEnd.getTime() && oStart.getTime() < oTaskEnd.getTime()) {
					aOverlappingTasks.push(oValue);
				}
			});
			if (aOverlappingTasks.length === 1) {
				return aOverlappingTasks[0];
			}
			// sort by startDate ascending in pull mode, descending in push mode
			aOverlappingTasks.sort(function (a, b) {
				aStart = a.actualStart ? a.actualStart : a.plannedStart;
				bStart = b.actualStart ? b.actualStart : b.plannedStart;
				if (bPull) {
					return aStart - bStart;
				} else {
					return bStart - aStart;
				}
			});
			// find the next overlapping task
			oOverlappingTask = aOverlappingTasks.find(function (oTask) {
				oTaskStart = oTask.actualStart ? oTask.actualStart : oTask.plannedStart;
				if (bPull) {
					return oTaskStart > oStart;
				} else {
					return oTaskStart < oStart;
				}
			});
			return oOverlappingTask;
		},

		checkCollisionWithExistingTasks: function (aExistingTasks, oTask) {
			var oTaskStart = oTask.actualStart ? new Date(oTask.actualStart) : new Date(oTask.plannedStart),
				oTaskEndIncWait = oTask.waitDuration ? new Date(oTask.estimatedEnd.getTime() + oTask.waitDuration) : new Date(oTask.estimatedEnd.getTime()),
				aCollissionTasks = [],
				oCompareStart,
				oCompareEnd,
				sMsg;
			aExistingTasks.forEach(function (oValue) {
				oCompareStart = oValue.actualStart ? new Date(oValue.actualStart.getTime()) : new Date(oValue.plannedStart.getTime());
				oCompareEnd = oValue.waitDuration ? new Date(oValue.estimatedEnd.getTime() + oValue.waitDuration) :
					new Date(oValue.estimatedEnd.getTime());
				// (iStart1 < iEnd2 && iStart2 < iEnd1) = overlap formula
				if (oCompareStart < oTaskEndIncWait && oTaskStart < oCompareEnd) {
					aCollissionTasks.push(oCompareStart.toLocaleString() + " - " + oValue.shortText);
				}
			});
			sMsg = aCollissionTasks.length > 0 ? "Colliding tasks:" + "\n" + aCollissionTasks.join("\n") : "";
			if (sMsg) {
				MessageBox.warning(sMsg);
			}
			//return aCollissionTasks;
		},

		/////////////////////////////////////////// FUNCTIONS FOR SEQUENCING ////////////////////////////////////////////

		_intersectAllRowDateRanges: function (aAllAvailableDateRanges, mDurationRequired, oShift) {
			var that = this;
			// starts with the available date ranges of the first row
			// each further row might reduce the amount of available slots
			// returns only slots that are available in all rows and have a min duration of mDurationRequired
			return aAllAvailableDateRanges.reduce(function (aFoundDateRanges, aRowDateRanges) {
				return that._intersectTwoRowDateRanges(aFoundDateRanges, aRowDateRanges, mDurationRequired, oShift);
			}, aAllAvailableDateRanges[0]);
		},

		_intersectTwoRowDateRanges: function (aRow1DateRanges, aRow2DateRanges, mDurationRequired, oShift) {
			var aIntersections = [],
				oIntersection,
				that = this;
			aRow1DateRanges.forEach(function (oDR1) {
				aRow2DateRanges.forEach(function (oDR2, i) {
					oIntersection = that._getIntersection(oDR1, oDR2);
					if (oIntersection) {
						if (i === aRow2DateRanges.length - 1) {
							oIntersection.end = new Date(2999, 0); // last of the row --> duration fits anyway
							aIntersections.push(oIntersection);
						} else if (that.getNetDurationHoursFromDates(oIntersection.start, oIntersection.end, oShift) >= mDurationRequired) {
							aIntersections.push(oIntersection);
						}
					}
				});
			});
			return aIntersections;
		},

		_getIntersection: function (oDR1, oDR2) {
			var oFirst,
				oLast,
				oIntersect = {
					start: undefined,
					end: undefined
				};
			if (oDR1.start.getTime() < oDR2.start.getTime()) {
				oFirst = oDR1;
				oLast = oDR2;
			} else {
				oFirst = oDR2;
				oLast = oDR1;
			}
			if (oFirst.end.getTime() < oLast.start.getTime()) return null;
			oIntersect.start = oLast.start;
			oIntersect.end = (oFirst.end.getTime() < oLast.end.getTime()) ? oFirst.end : oLast.end;
			return oIntersect;
		},

		_isOverlappingOrFollowing: function (oStart1, oEnd1, oStart2, oEnd2) {
			return oEnd1.getTime() === oStart2.getTime() ||
				(oStart1.getTime() < oEnd2.getTime() && oStart2.getTime() < oEnd1.getTime());
		},

		// combines date ranges if they are overlapping or directly following
		_combineDateRanges: function (aDR) {
			var that = this,
				oStart,
				oDateRange = {
					start: undefined,
					end: undefined
				};
			if (!aDR || aDR.length === 0) return [];
			oStart = aDR[0].start;
			return aDR.reduce(function (aCombinedDateRanges, oDR, i, aDR) {
				if (i < aDR.length - 1) {
					if (!that._isOverlappingOrFollowing(oDR.start, oDR.end, aDR[i + 1].start, aDR[i + 1].end)) {
						// not overlapping, create a date range
						oDateRange.start = new Date(oStart.getTime());
						oDateRange.end = new Date(oDR.end.getTime());
						aCombinedDateRanges.push(oDateRange);
						oStart = new Date(aDR[i + 1].start.getTime());
					}
				} else { // last date range
					oDateRange.start = new Date(oStart.getTime());
					oDateRange.end = new Date(oDR.end.getTime());
					aCombinedDateRanges.push(oDateRange);
				}
				return aCombinedDateRanges;
			}, []);
		},

		_getCrewIDsOfTask: function (oTask) {
			var oModel = this.getModel(),
				aCrewPaths = oTask.getBindingContext().getProperty("crews"),
				aCrewIDs = [];
			aCrewPaths.forEach(function (oCrewPath) {
				aCrewIDs.push(oModel.createBindingContext("/" + oCrewPath).getProperty("crew_ID"));
			});
			return aCrewIDs;
		},

		_getWorkerIDsOfTask: function (oTask) {
			var oModel = this.getModel(),
				aWorkerPaths = oTask.getBindingContext().getProperty("workers"),
				aWorkerIDs = [];
			aWorkerPaths.forEach(function (oWorkerPath) {
				aWorkerIDs.push(oModel.createBindingContext("/" + oWorkerPath).getProperty("worker_ID"));
			});
			return aWorkerIDs;
		},

		_crewOrWorkerAssigned: function (aCrewIDsToSearch, aWorkerIDsToSearch, oTask) {
			var aCrewIDs = this._getCrewIDsOfTask(oTask),
				aWorkerIDs = this._getWorkerIDsOfTask(oTask);
			if (aCrewIDs.find(function (sCrewID) {
					return aCrewIDsToSearch.includes(sCrewID);
				})) return true;
			if (aWorkerIDs.find(function (sWorkerID) {
					return aWorkerIDsToSearch.includes(sWorkerID);
				})) return true;
			return false;
		},

		_findLastEndWithResource: function (aSearchTasks, oTask) {
			var aCewSearchIDs = this._getCrewIDsOfTask(oTask),
				aWorkerSearchIDs = this._getWorkerIDsOfTask(oTask),
				aSearch = [],
				oLastEnd;
			aSearchTasks.forEach(function (oSearchTask) { // keep aSearchTasks untouched
				aSearch.push(oSearchTask);
			});
			aSearch.sort(function (a, b) { // sort descending wthout wait time
				return b.getBindingContext().getProperty("estimatedEnd").getTime() -
					a.getBindingContext().getProperty("estimatedEnd").getTime();
			});
			for (var i = 0; i < aSearch.length; i++) {
				if (this._crewOrWorkerAssigned(aCewSearchIDs, aWorkerSearchIDs, aSearch[i])) {
					oLastEnd = new Date(aSearch[i].getBindingContext().getProperty("estimatedEnd").getTime());
					break;
				}
			}
			return oLastEnd;
		},

		// finds available date ranges after the minimum start date independent of their durations
		_findAvailableDateRangesInRow: function (oTaskToPosition, aTasksOfRow) {
			var aAvailableDateRanges = [],
				oStart = new Date(oTaskToPosition.getStartDate().getTime()), // this is the earliest possible time
				aCrewIDs,
				aWorkerIDs,
				bCrewFound,
				bWorkerFound,
				aCrewsToSearchIDs,
				aWorkersToSearchIDs,
				oAvailableDateRangeStart,
				oAvailableDateRangeEnd,
				oNextTask,
				oPreviousTask,
				aReversedTasks = [],
				that = this;

			aCrewIDs = this._getCrewIDsOfTask(oTaskToPosition);
			aWorkerIDs = this._getWorkerIDsOfTask(oTaskToPosition);
			aAvailableDateRanges = aTasksOfRow.reduce(function (aDateRanges, oTask, i, aAllTasks) {
				// find if crews of oTaskToPosition are assigned to tasks of the row
				// if not then their date ranges are available ranges
				aCrewsToSearchIDs = that._getCrewIDsOfTask(oTask);
				bCrewFound = aCrewIDs.find(function (sCrewID) {
					return aCrewsToSearchIDs.includes(sCrewID);
				});
				aWorkersToSearchIDs = that._getWorkerIDsOfTask(oTask);
				bWorkerFound = aWorkerIDs.find(function (sWorkerID) {
					return aWorkersToSearchIDs.includes(sWorkerID);
				});
				// if not found and end is GT oStart then add the available range
				if (!bCrewFound && !bWorkerFound &&
					(oTask.getBindingContext().getProperty("estimatedEnd").getTime() +
						oTask.getBindingContext().getProperty("waitDuration")) > oStart.getTime()) {
					// extend the end to the next task start if available or to indefinite
					oNextTask = aAllTasks.find(function (oValue) {
						return oValue.getStartDate().getTime() >= oTask.getEndDate().getTime(); // doesn't matter if inc wait
					});
					oAvailableDateRangeEnd = oNextTask ? new Date(oNextTask.getStartDate().getTime()) : new Date(2999, 0);
					// extend the start to the last task end if available
					aReversedTasks = [];
					aAllTasks.forEach(function (v) {
						aReversedTasks.push(v);
					});
					aReversedTasks.reverse(); // to find previous
					oPreviousTask = aReversedTasks.find(function (oValue) {
						// can lead to overlapping ranges if wait is already included in previous available range; is dealt with when combining ranges
						return oValue.getBindingContext().getProperty("estimatedEnd").getTime() <= oTask.getStartDate().getTime();
					});
					oAvailableDateRangeStart = oPreviousTask ? new Date(oPreviousTask.getBindingContext().getProperty("estimatedEnd").getTime()) :
						new Date(oTask.getStartDate().getTime());
					// re-adjust if start became earlier than oStart
					oAvailableDateRangeStart = (oAvailableDateRangeStart.getTime() < oStart.getTime()) ? oStart : oAvailableDateRangeStart;
					// revisit: date range could be in a different shift --> adjust to shift times
					aDateRanges.push({
						start: oAvailableDateRangeStart,
						end: oAvailableDateRangeEnd
					});
				}
				return aDateRanges;
			}, []);
			return this._combineDateRanges(aAvailableDateRanges);
		},

		getStartFromWorkforce: function (oTask, aSearchTasks, mRow) {
			// aSearchTasks is an array of rows containing arrays of tasks
			// search after minStart, only in previous rows (no wait time applied)
			// for tasks without the workforce assigned
			// build an array of available date ranges,
			// combine overlapping or following date ranges
			// then get the intersections with all date ranges in previous rows and check if they are long enough
			var oTaskBC = oTask.getBindingContext(),
				oNewStart = new Date(oTask.getStartDate().getTime()), // this is the earliest possible time
				aAvailableDateRanges = [],
				oShift = this.getShiftFromID(oTaskBC.getProperty("shift_ID")),
				// oTask.startDate was adjusted by the calling function; therefore calculate duration from quantity, productivity
				mTaskNetDurationHrs = this.getNetDurationHours(oTaskBC.getProperty("quantity"),
					(oTaskBC.getProperty("plannedProductivity") * oTaskBC.getProperty("productivityFactor"))),
				aTimeRangeFits,
				oLastEnd,
				that = this;
			// keep aAvailableDateRanges an array even if only the first item is used
			// maybe in future a task shall be auto split
			aSearchTasks.forEach(function (aRowTasks) {
				aAvailableDateRanges.push(that._findAvailableDateRangesInRow(oTask, aRowTasks));
			});
			// testing
			/*			var aAvailableTestDateRanges = [
							[{
								start: new Date(2021, 2, 1, 7),
								end: new Date(2021, 2, 1, 10)
							}, {
								start: new Date(2021, 2, 1, 18),
								end: new Date(2021, 2, 2, 15)
							}],
							[{
								start: new Date(2021, 2, 1, 8),
								end: new Date(2021, 2, 1, 11)
							}, {
								start: new Date(2021, 2, 2, 11),
								end: new Date(2021, 2, 2, 14)
							}],
							[{
								start: new Date(2021, 2, 1, 9),
								end: new Date(2021, 2, 1, 12)
							}, {
								start: new Date(2021, 2, 2, 12),
								end: new Date(2021, 2, 2, 18)
							}]
						];
			*/
			// aTimeRangeFits includes all date ranges where oTask workforce is not busy and where net duration is long enough
			aTimeRangeFits = this._intersectAllRowDateRanges(aAvailableDateRanges, mTaskNetDurationHrs, oShift);
			if (aTimeRangeFits && aTimeRangeFits.length > 0) {
				oNewStart = new Date(aTimeRangeFits[0].start.getTime());
			} else {
				// no gap or no gap long enough or last task in row 
				// put it behind the last task of previous rows with resource overlap
				for (var i = 0; i < mRow; i++) {
					oLastEnd = this._findLastEndWithResource(aSearchTasks[i], oTask);
					if (oLastEnd && oLastEnd.getTime() > oNewStart.getTime()) {
						oNewStart = new Date(oLastEnd.getTime());
					}
				}
			}
			return oNewStart;
		},

		/////////////////////////////////////////// ADDITIONAL FUNCTIONS FOR TIME SHEETS /////////////////////////////

		getWorkersOfTask: function (oTask) {
			var oModel = this.getModel(),
				sTaskPath = oModel.createKey("/Tasks", {
					ID: oTask.ID
				}),
				oTaskBC = oModel.createBindingContext(sTaskPath),
				aWorkersPaths = oTaskBC.getProperty("workers"),
				aCrewsPaths = oTaskBC.getProperty("crews"),
				aAllWorkerValues = [],
				oWorkerBC,
				sWorkerID,
				oCrewBC,
				aCrewMemberPaths,
				mRate,
				i, j;
			// get all workers assigned to task
			if (aWorkersPaths) {
				for (i = 0; i < aWorkersPaths.length; i++) {
					oWorkerBC = oModel.createBindingContext("/" + aWorkersPaths[i]); // is /WorkersForTask
					if (oWorkerBC) { // if it doesn't exist it was just deleted but the local model wasn't updated yet
						sWorkerID = oWorkerBC.getProperty("worker_ID");
						mRate = oWorkerBC.getProperty("worker/wageClass/rate");
						aAllWorkerValues.push({
							ID: sWorkerID,
							rate: mRate
						});
					}
				}
			}
			if (aCrewsPaths) {
				for (i = 0; i < aCrewsPaths.length; i++) {
					oCrewBC = oModel.createBindingContext("/" + aCrewsPaths[i]);
					if (oCrewBC) { // if it doesn't exist it was just deleted but the local model wasn't updated until now
						aCrewMemberPaths = oCrewBC.getProperty("crew/crewMembers");
						for (j = 0; j < aCrewMemberPaths.length; j++) {
							oWorkerBC = oModel.createBindingContext("/" + aCrewMemberPaths[j]); // is /Persons
							sWorkerID = oWorkerBC.getProperty("ID");
							mRate = oWorkerBC.getProperty("wageClass/rate");
							aAllWorkerValues.push({
								ID: sWorkerID,
								rate: mRate
							});
						}
					}
				}
			}
			return aAllWorkerValues;
		},

		getWorkingTimesInShiftPart: function (oStart, oEnd, oShiftPart, oCurrentTime) {
			var bLastShiftPart = (oCurrentTime.getTime() + this.getRemainingDurationHoursOfShiftPart(oCurrentTime, oShiftPart) * 60 * 60 *
					1000) >=
				oEnd.getTime(),
				bFirstShiftPart = (oStart.getTime() === oCurrentTime.getTime()),
				oTimeInterval = {
					date: new Date(oCurrentTime),
					wageIncrease: oShiftPart.wageIncrease,
					timeTypeID: oShiftPart.timeTypeID,
					shiftPartID: oShiftPart.ID,
					startTimeHours: oShiftPart.startTimeHrs,
					startTimeMinutes: oShiftPart.startTimeMins,
					endTimeHours: oShiftPart.endTimeHrs,
					endTimeMinutes: oShiftPart.endTimeMins,
					completed: bLastShiftPart
				};

			if (oShiftPart.breakTime) {
				return undefined;
			}
			// correct times in case of first/last shiftPart
			if (bFirstShiftPart) { // start time is within shiftPart
				oTimeInterval.startTimeHours = oStart.getHours();
				oTimeInterval.startTimeMinutes = oStart.getMinutes();
			}
			if (bLastShiftPart) { // end time is within shiftPart
				oTimeInterval.endTimeHours = oEnd.getHours();
				oTimeInterval.endTimeMinutes = oEnd.getMinutes();
			}
			return oTimeInterval;
		},

		getShiftPartsAndValues: function (oTask, bPlanned) {
			var oShift = this.getShiftFromID(oTask.shift_ID),
				oCurrentTime,
				oStart,
				oEnd,
				iShiftPartIndex,
				oShiftPartValues,
				aShiftPartsWithValues = [],
				bComplete = false;

			oCurrentTime = bPlanned ? new Date(oTask.plannedStart) : new Date(oTask.actualStart);
			oStart = new Date(oCurrentTime);
			oEnd = bPlanned ? new Date(oTask.plannedEnd) : new Date(oTask.estimatedEnd);
			iShiftPartIndex = this.getShiftPartIndexFromDate(oCurrentTime, oShift);
			while (!bComplete) {
				oShiftPartValues = this.getWorkingTimesInShiftPart(oStart, oEnd, oShift.shiftParts[iShiftPartIndex], oCurrentTime);
				if (oShiftPartValues) { // undefined if it is break time
					aShiftPartsWithValues.push(oShiftPartValues);
				}
				if (oShiftPartValues && oShiftPartValues.completed) {
					bComplete = true;
					break;
				}
				if (iShiftPartIndex === (oShift.shiftParts.length - 1)) { // last shiftPart of this shift
					iShiftPartIndex = 0;
					oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
				} else {
					iShiftPartIndex++;
					oCurrentTime.setHours(oShift.shiftParts[iShiftPartIndex].startTimeHrs);
					oCurrentTime.setMinutes(oShift.shiftParts[iShiftPartIndex].startTimeMins);
				}
			}
			return aShiftPartsWithValues;
		},
		/* now in timesheet app
				createWorkerTimeSheets: function (oTask) {
					// all person related data is loaded already
					var oModel = this.getModel(),
						sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
						sMsgSucc = "",
						sMsgErr = this.getResourceBundle().getText("errorCreatingTimeSheets"),
						that = this;
					// get workers for task
					var aAllWorkers = this.getWorkersOfTask(oTask);
					if (aAllWorkers.length === 0) {
						return;
					}
					sMsgSucc = this.getResourceBundle().getText("successCreatingTimeSheet", [aAllWorkers.length]);
					// get shiftParts worked
					var aShiftPartsWorked = this.getShiftPartsAndValues(oTask, false);
					if (aShiftPartsWorked.length === 0) {
						return;
					}
					// create time sheet entries
					aAllWorkers.reduce(function (p, oWorker, j, aWorkersArray) {
						aShiftPartsWorked.reduce(function (q, oShiftPart, k, aShiftPartsArray) {
							new Promise(function (resolve) {
								var oTimeSheetEntry = {};
								oTimeSheetEntry.project_ID = sProjectID;
								oTimeSheetEntry.person_ID = oWorker.ID;
								oTimeSheetEntry.task_ID = oTask.ID;
								oTimeSheetEntry.shiftPart_ID = oShiftPart.shiftPartID;
								oTimeSheetEntry.workingDate = oShiftPart.date;
								oTimeSheetEntry.startTimeHrs = oShiftPart.startTimeHours;
								oTimeSheetEntry.startTimeMins = oShiftPart.startTimeMinutes;
								oTimeSheetEntry.endTimeHrs = oShiftPart.endTimeHours;
								oTimeSheetEntry.endTimeMins = oShiftPart.endTimeMinutes;
								oTimeSheetEntry.hoursWorked = parseFloat(that.getDecimalHours(oShiftPart.endTimeHours, oShiftPart.endTimeMinutes) -
									that.getDecimalHours(oShiftPart.startTimeHours, oShiftPart.startTimeMinutes)).toFixed(3);
								oTimeSheetEntry.rate = parseFloat(oWorker.rate * (1 + oShiftPart.wageIncrease * 0.01)).toFixed(3);
								oTimeSheetEntry.calculatedCost = parseFloat(oTimeSheetEntry.hoursWorked * oTimeSheetEntry.rate).toFixed(3);
								oModel.create("/TimeSheetEntries", oTimeSheetEntry, {
									success: function (oData) {
										if (j === (aWorkersArray.length - 1)) {
											MessageToast.show(sMsgSucc);
										}
									},
									error: function (oError) {
										MessageToast.show(sMsgErr);
									}
								});
							});
						}, Promise.resolve());
					}, Promise.resolve());
				},
		*/
		getPlannedLabourValues: function (oTask) {
			var aAllWorkers,
				aShiftPartsPlanned,
				oReturn = {
					hours: 0,
					cost: 0
				},
				mHours = 0,
				mRate = 0;

			if (!oTask) {
				return oReturn;
			}
			aAllWorkers = this.getWorkersOfTask(oTask);
			aShiftPartsPlanned = this.getShiftPartsAndValues(oTask, true);
			for (var h = 0; h < aAllWorkers.length; h++) {
				for (var i = 0; i < aShiftPartsPlanned.length; i++) {
					mHours = this.getDecimalHours(aShiftPartsPlanned[i].endTimeHours, aShiftPartsPlanned[i].endTimeMinutes) -
						this.getDecimalHours(aShiftPartsPlanned[i].startTimeHours, aShiftPartsPlanned[i].startTimeMinutes);
					mRate = aAllWorkers[h].rate * (1 + aShiftPartsPlanned[i].wageIncrease * 0.01);
					oReturn.hours += mHours;
					oReturn.cost += mRate * mHours;
				}
			}
			oReturn.hours = parseFloat(String(oReturn.hours)).toFixed(2);
			oReturn.cost = parseFloat(String(oReturn.cost)).toFixed(2);
			return oReturn;
		},

		updatePlannedLaborCostOfTasks: function (aTaskIDs) {
			// all tasks are loaded into the model already
			var oModel = this.getModel(),
				sTaskPath,
				oTaskBC,
				oTask,
				oLaborValues = {
					hours: 0,
					cost: 0
				},
				that = this;

			aTaskIDs.forEach(function (sTaskID) {
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				});
				oTaskBC = oModel.createBindingContext(sTaskPath);
				oTask = oTaskBC.getObject();
				oLaborValues = that.getPlannedLabourValues(oTask);
				oModel.setProperty("hoursLaborPlanned", oLaborValues.hours, oTaskBC);
				oModel.setProperty("costLaborPlanned", oLaborValues.cost, oTaskBC);
			});
			oModel.submitChanges({
				error: function (oError) {
					Log.error("Error updating planned labor cost after change of workforce");
				}
			});
		},

		getActualLabourValues: function (oTask) {
			// go hrough timesheet entries
			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Tasks", {
					ID: oTask.ID
				}),
				oTaskBC = oModel.createBindingContext(sPath),
				aTimeSheetEntries = oTaskBC.getProperty("timeSheetEntries"),
				oReturn = {
					hours: 0,
					cost: 0
				},
				oTimeSheetEntry;

			if (!oTask || oTask.status < 4) {
				oReturn.hours = 0;
				oReturn.cost = "";
				return oReturn;
			}

			for (var i = 0; i < aTimeSheetEntries.length; i++) {
				oTimeSheetEntry = oModel.getObject("/" + aTimeSheetEntries[i], {
					select: "hoursWorked, calculatedCost"
				});
				oReturn.hours += Number(oTimeSheetEntry.hoursWorked);
				oReturn.cost += Number(oTimeSheetEntry.calculatedCost);
			}
			oReturn.cost = parseFloat(String(oReturn.cost)).toFixed(2);
			return oReturn;
		},

		/////////////////////////////////////////// OPERATIONAL DATA FUNCTIONS ///////////////////////////////////////

		checkAutoCompleteMeasurements: function (oTask) {
			var oModel = this.getModel(),
				sPath = "/Measurements",
				aFilter = [new Filter({
					path: "task_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: oTask.ID
				})],
				aSorter = [new Sorter({
					path: "measurementDateTime",
					descending: true
				})],
				getCumulativeMeasurement = function () { // must read from db as oModel doesn't include the last measurement
					return new Promise(function (resolve, reject) {
						// read last measurement to get cumulative actual quantity
						oModel.read(sPath, {
							urlParameters: {
								$inlinecount: "allpages",
								$top: 1
							},
							filters: aFilter,
							sorters: aSorter,
							success: function (oData) {
								if (oData.results.length > 0) {
									var sQuantity = oData.results[0].measurementQuantity,
										sDuration = oData.results[0].netDuration;
									resolve([sQuantity, sDuration]);
								} else {
									resolve([0, 0]);
								}
							},
							error: function () {
								resolve([0, 0]);
							}
						});
					});
				},
				actualQuantity = 0,
				actualDuration = 0,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oMeasurement,
				mNetDurationHours,
				sPath,
				oNow = new Date(),
				oShift = this.getShiftFromID(oTask.shift_ID),
				that = this;
			getCumulativeMeasurement().then(function (cumulativeValueArray) {
				actualQuantity = cumulativeValueArray[0];
				actualDuration = cumulativeValueArray[1];
				if (!actualQuantity || actualQuantity === 0 || Number(actualQuantity) < Number(oTask.quantity)) {
					// create an autocomplete measurement with the value of the planned quantity
					// if oNow is not in shift, set oNow to the last shift end
					if (!that.inShift(oNow, oShift)) {
						oNow = that.getShiftEnd(oNow, oShift);
					}
					// oNow will be adjusted to shift end if not in shift
					mNetDurationHours = that.getNetDurationHoursFromDates(oTask.actualStart, oNow, oShift);
					mNetDurationHours -= oTask.stopDuration / 60 / 60 / 1000;
					mNetDurationHours = mNetDurationHours.toFixed(3);
					oMeasurement = {
						project_ID: sProjectID,
						task_ID: oTask.ID,
						measurementDateTime: oNow,
						measurementQuantity: oTask.quantity,
						netDuration: mNetDurationHours
					};
					sPath = "/Measurements";
					oModel.create(sPath, oMeasurement, {
						success: function () {
							MessageToast.show(that.getResourceBundle().getText("messageSuccessAutoCompleteMeasurement"));
						},
						error: function (oError) {
							Log.error("Error creating final measurement: " + JSON.stringify(oError));
						}
					});
					// update task after new measurement
					oTask.currentProductivity = parseFloat(oTask.quantity / oMeasurement.netDuration).toFixed(3);
					oTask.KPI = parseFloat(
						oTask.currentProductivity / (oTask.plannedProductivity * oTask.productivityFactor)).toFixed(3);
					oTask.actualQuantity = oTask.quantity;
					if (oTask.price) { // if subcontracted totals are equal as planned/actual quants are equal
						oTask.actualTotalPrice = oTask.plannedTotalPrice;
					}
					sPath = "/" + oModel.createKey(
						"Tasks", {
							ID: oTask.ID
						});
					oModel.update(sPath, oTask);
					actualQuantity = oTask.quantity;
					actualDuration = oMeasurement.netDuration;
				}
				that.saveResultToRecipe(oTask, [actualQuantity, actualDuration]);
			});
		},

		getHeadCount: function (oTask) {
			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Tasks", {
					ID: oTask.ID
				}),
				oBC = oModel.createBindingContext(sPath),
				iHeadCount = 0,
				aCrews = oBC.getProperty("crews"),
				oCrewBC;

			for (var i = 0; i < aCrews.length; i++) {
				oCrewBC = oModel.createBindingContext("/" + aCrews[i]);
				iHeadCount += oCrewBC.getProperty("crew/crewMembers").length;
			}
			iHeadCount += oBC.getProperty("workers").length;
			return iHeadCount;
		},

		saveResultToRecipe: function (oTask, actuals) {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sPlannedProductivity = parseFloat(oTask.plannedProductivity * oTask.productivityFactor).toFixed(3),
				iHeadCount = this.getHeadCount(oTask),
				oRecipeResult = {
					recipe_ID: oTask.recipe_ID,
					task_ID: oTask.ID,
					project_ID: sProjectID,
					company_ID: oTask.company_ID,
					productivityPlan: sPlannedProductivity,
					recordingDate: new Date(),
					quantity: actuals[0],
					netDuration: actuals[1],
					headCount: iHeadCount
				},
				that = this;
			oModel.create("/RecipeResults", oRecipeResult, {
				success: function () {
					MessageToast.show(that.getResourceBundle().getText("messageResultsSaved"));
				}
			});
		},

		deleteLocationAndDependents: function (aLocationIDs) {
			// deletes locations without children; parent drill state is adjusted
			var oModel = this.getModel(),
				oTreeTable = this.byId("projectTreeTable"),
				aAllLocationRows = oTreeTable.getRows(), // must include myself, siblings and parent
				aAllLocations = [],
				sLocationKey,
				i,
				sParentLocationPath,
				iParentIndex,
				iCurrentParentNodeID,
				iOwnIndex,
				parentFind = function (oLocation, iIndex, aArray) {
					return oLocation.nodeID === iCurrentParentNodeID;
				},
				siblingFind = function (oLocation, iIndex, aArray) {
					return oLocation.parentNodeID === iCurrentParentNodeID;
				},
				myselfFind = function (oLocation, iIndex, aArray) {
					return oLocation.ID === aLocationIDs[i];
				},
				aTaskFilter,
				sTaskDeletePath,
				that = this;

			MessageToast.show(this.getResourceBundle().getText("toastDeleteLocationWithTasks"));
			for (i = 0; i < aAllLocationRows.length; i++) {
				if (aAllLocationRows[i].getBindingContext()) {
					aAllLocations.push(aAllLocationRows[i].getBindingContext().getObject({
						select: "*"
					}));
				} else { // unfilled row at the end
					break;
				}
			}
			for (i = 0; i < aLocationIDs.length; i++) {
				sLocationKey = "/" + oModel.createKey("Locations", {
					ID: aLocationIDs[i]
				});
				oModel.remove(sLocationKey); // removes also tasks and dependent data
				// don't remove deleted location from aAllLocations - otherwise index is wrong
				// instead set the nodeIDs to -1
				iOwnIndex = aAllLocations.findIndex(myselfFind);
				aAllLocations[iOwnIndex].nodeID = -1;
				iCurrentParentNodeID = aAllLocations[iOwnIndex].parentNodeID;
				aAllLocations[iOwnIndex].parentNodeID = -1;
				// check if it was the last child and adjust drill state
				if (aAllLocations.findIndex(siblingFind) < 0) { // no siblings
					iParentIndex = aAllLocations.findIndex(parentFind);
					if (iParentIndex > 0) { // adjust drill state to "leaf"
						aAllLocations[iParentIndex].drillState = "leaf";
						sParentLocationPath = "/" + oModel.createKey("Locations", {
							ID: aAllLocations[iParentIndex].ID
						});
						oModel.update(sParentLocationPath, aAllLocations[iParentIndex]);
					}
				}
			}
		},

		_nextTaskNumber: function (sProjectID, sTaskName) {
			var oModel = this.getModel(),
				sPath = "/Tasks",
				aFilter = [
					new Filter({
						path: "taskName",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sTaskName
					}),
					new Filter({
						path: "project_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sProjectID
					})
				],
				aSorter = [new Sorter({
					path: "number",
					descending: true
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					and: true,
					sorters: aSorter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(oData.results[0].number + 1);
						} else {
							resolve(1);
						}
					},
					error: function () {
						resolve(1);
					}
				});
			});
		},

		_getTaskNamesWithNumbers: function (sProjectID, aTasks) {
			var aNamesWithNumbers = [],
				that = this;

			// remove duplicate taskNames
			/*			var aUniqueTasks = aTasks.reduce((unique, o) => {
							if (!unique.some(obj => obj.taskName === o.taskName)) {
								unique.push(o);
							}
							return unique;
						}, []);
			*/
			var aUniqueTasks = aTasks.reduce(function (accumulator, currentValue) {
				if (accumulator.indexOf(currentValue) === -1) {
					accumulator.push(currentValue);
				}
				return accumulator;
			}, []);
			// find the new task number for each taskName
			return new Promise(function (resolve, reject) {
				aUniqueTasks.forEach(function (oTask, i, aArray) {
					that._nextTaskNumber(sProjectID, oTask.taskName).then(function (iNumber) {
						aNamesWithNumbers.push({
							taskName: oTask.taskName,
							taskNumber: iNumber
						});
						if (i === aArray.length - 1) {
							resolve(aNamesWithNumbers);
						}
					});
				});
			});
		},

		_loadShifts: function (sProjectID) {
			var oModel = this.getModel(),
				sProjectKey = oModel.createKey("Projects", {
					ID: sProjectID
				}),
				sShiftsKey = "/" + sProjectKey + "/shifts",
				sShiftPartsKey = "",
				sTimeTypeKey = "",
				getShifts = function (sPath) {
					var aShifts = [];
					return new Promise(function (resolve, reject) {
						oModel.read(sShiftsKey, {
							success: function (oShiftData) {
								for (var l = 0; l < oShiftData.results.length; l++) {
									aShifts.push({
										ID: oShiftData.results[l].ID,
										code: oShiftData.results[l].code,
										defaultShift: oShiftData.results[l].defaultShift,
										ignoreWeekends: oShiftData.results[l].ignoreWeekends,
										ignoreHolidays: oShiftData.results[l].ignoreHolidays,
										shiftParts: []
									});
								}
								resolve(aShifts);
							}
						});
					});
				},
				getShiftParts = function (aShifts) {
					return new Promise(function (resolve, reject) {
						aShifts.reduce(function (p, oShift, i, aShiftsArray) {
							new Promise(function () {
								sShiftPartsKey = "/" + oModel.createKey("Shifts", {
									ID: oShift.ID
								}) + "/shiftParts";
								oModel.read(sShiftPartsKey, {
									success: function (oShiftParts) {
										oShiftParts.results.reduce(function (q, oShiftPart, j) {
											new Promise(function () {
												sTimeTypeKey = "/" + oModel.createKey("TimeTypes", {
													ID: oShiftParts.results[j].timeType_ID
												});
												oModel.read(sTimeTypeKey, {
													success: function (oTimeType) {
														if (oTimeType) {
															aShifts[i].shiftParts.push({
																ID: oShiftParts.results[j].ID,
																startTimeHrs: oShiftParts.results[j].startTimeHrs,
																startTimeMins: oShiftParts.results[j].startTimeMins,
																endTimeHrs: oShiftParts.results[j].endTimeHrs,
																endTimeMins: oShiftParts.results[j].endTimeMins,
																timeTypeID: oShiftParts.results[j].timeType_ID,
																wageIncrease: oTimeType.wageIncrease,
																breakTime: oTimeType.breakTime
															});
															resolve(aShifts);
														}
													}
												});
											});
										}, Promise.resolve());
									}
								});
							});
						}, Promise.resolve(aShifts));
					});
				},
				getSpecialDays = function (sProjectPath) {
					var sSpecialDatesPath = "/" + sProjectPath + "/specialDates",
						aWeekendDays = [],
						aHolidays = [];
					return new Promise(function (resolve, reject) {
						oModel.read(sSpecialDatesPath, {
							success: function (oSpecialDatesData) {
								for (var i = 0; i < oSpecialDatesData.results.length; i++) {
									if (oSpecialDatesData.results[i].description === "Weekend Day") {
										aWeekendDays.push(oSpecialDatesData.results[i].specialDate.getMonth());
									} else {
										aHolidays.push({
											startDate: new Date(oSpecialDatesData.results[i].specialDate),
											description: oSpecialDatesData.results[i].description,
											type: "NonWorking"
										});
									}
								}
								resolve([aWeekendDays, aHolidays]);
							}
						});
					});
				},
				sortShifts = function (oShifts) {
					return new Promise(function (resolve) {
						for (var i = 0; i < oShifts.length; i++) {
							// revisit: next day flag must be interpreted (add 24h)
							oShifts[i].shiftParts.sort(function (a, b) {
								return (a.startTimeHrs + a.startTimeMins / 60) - (b.startTimeHrs + b.startTimeMins / 60);
							});
						}
						resolve(oShifts);
					});
				},
				oWorkingTimes = {
					shifts: [],
					weekendDays: [],
					specialDates: []
				},
				oWorkTimeModel = this.getModel("workTimeModel");

			// error handling in detail controller
			return new Promise(function (resolve, reject) {
				getShifts(sShiftsKey)
					.then(function (aShifts) {
						return getShiftParts(aShifts);
					}).then(function (aFinalShifts) {
						return sortShifts(aFinalShifts);
					}).then(function (oShifts) {
						oWorkingTimes.shifts = oShifts;
						return getSpecialDays(sProjectKey);
					}).then(function (aSpecialDays) {
						oWorkingTimes.weekendDays = aSpecialDays[0];
						oWorkingTimes.specialDates = aSpecialDays[1];
						oWorkTimeModel.setData(oWorkingTimes);
						resolve(oWorkingTimes);
					});
			});
		}

	});
});