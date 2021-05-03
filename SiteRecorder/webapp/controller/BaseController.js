sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/base/Log"
], function (Controller, Filter, FilterOperator, Sorter, MessageBox, MessageToast, History, JSONModel, Log) {
	"use strict";

	return Controller.extend("site.recorder.SiteRecorder.controller.BaseController", {
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

		getUserInfo: function (sAppName, sRole, sProjectCode, sProjectID) {
			var oModel = this.getModel(),
				oViewModel = this.getModel("masterView"), // only called from master view
				oUserModel = this.getModel("userModel"),
				oLogin = {},
				aProjectFilter = [
					new Filter("project_ID", FilterOperator.EQ, sProjectID)
				],
				aForemanFilter = [],
				aUserFilter = [],
				aUsersTasksFilter = [],
				oWorkList = this.byId("list"),
				that = this;

			oUserModel.setProperty("/app", sAppName);
			oUserModel.setProperty("/role", sRole);
			oUserModel.setProperty("/projectCode", sProjectCode);
			oLogin.app = sAppName;
			oLogin.role = sRole;
			oLogin.projectCode = sProjectCode;
			MessageToast.show(that.getResourceBundle().getText("msgPrepareWorkList"));
			oModel.create("/Logins", oLogin, {
				success: function (oData) {
					if (oData && oData.createdBy) {
						oUserModel.setProperty("/email", oData.createdBy);
						// check if it is a foreman or a site manager and adjust the user role
						aUserFilter = [
							new Filter("email", FilterOperator.EQ, oData.createdBy)
						];
						// get the UUID of the user
						oModel.read("/Persons", {
							urlParameters: {
								$inlinecount: "allpages",
								$top: 1
							},
							filters: aUserFilter,
							success: function (oPerson) {
								if (oPerson.results[0]) {

									// see if the user is assigned to a task as foreman
									aUsersTasksFilter = [new Filter("supervisor_ID", FilterOperator.EQ, oPerson.results[0].ID)];
									aForemanFilter = aProjectFilter.concat(aUsersTasksFilter);
									aForemanFilter.push(new Filter("status", FilterOperator.BT, 0, 3));
									oModel.read("/Tasks", {
										urlParameters: {
											$inlinecount: "allpages",
											$top: 1
										},
										filters: aForemanFilter,
										and: true,
										success: function (oTask) {
											if (!oTask.results || oTask.results.length === 0) {
												oUserModel.setProperty("/role", "Site Manager");
											} else { // foreman
												MessageToast.show(that.getResourceBundle().getText("msgFilteringForForeman"));
												oViewModel.setProperty("/busy", true);
												// disable filter button
												that.byId("filterButton").setVisible(false);
												// filter user's assigned tasks
												that._oListFilterState.aFilter[0] = new Filter("status", FilterOperator.BT, 0, 3); // don't show completed tasks
												that._oListFilterState.aFilter = that._oListFilterState.aFilter.concat(aUsersTasksFilter);
											}
											oWorkList.getBinding("items").filter(that._oListFilterState.aFilter, "Application");
											oViewModel.setProperty("/busy", false);
										},
										error: function () {
											Log.error("Error reading tasks of foreman " + oData.createdBy);
										}
									});
								}
							},
							error: function () {
								Log.error("Error: User with email address " + oData.createdBy + " not found in Master data");
							}
						});
					}
				},
				error: function () {
					Log.error("Error creating Login record");
				}
			});
		},

		////////////////////////////////////////// ROUTINES TO CALCULATE GROSS AND NET DATES AND DURATIONS /////////////////////////////////

		/// :loadshifts loads the oWorltimeModel from oData

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
		},

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

		getShiftEnd: function (oDate, oShift) { // returns end of previous shift
			var oShiftEndDate = new Date(oDate.getTime()),
				oLastShiftPart = oShift.shiftParts[oShift.shiftParts.length - 1];
			oShiftEndDate.setHours(oLastShiftPart.endTimeHrs);
			oShiftEndDate.setMinutes(oLastShiftPart.endTimeMins, 0, 0);
			return oShiftEndDate;
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

			if (mShiftStartHours <= mCurrentHours) { // shift starts next working day
				oNextShiftStartDate = new Date(this.getNextWorkingDay(oDate, oShift));
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

			if (mShiftEndHours >= mCurrentHours) { // shift starts previous working day
				oPreviousShiftEndDate = new Date(this.getPreviousWorkingDay(oDate, oShift));
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

		getStartDateInWorkingHours: function (oStartDate, oShift) {
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
			if (oShift.shiftParts[iCurrentShiftPartIndex].breakTime) { //Break time - go to next shiftPart start
				iCurrentShiftPartIndex += 1;
				oCurrentTime.setHours(oShift.shiftParts[iCurrentShiftPartIndex].startTimeHrs); // revisit: could be next day
				oCurrentTime.setMinutes(oShift.shiftParts[iCurrentShiftPartIndex].startTimeMins);
			} else if (this.getShiftEnd(oCurrentTime, oShift) === oCurrentTime) {
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
			}
			return oCurrentTime;
		},

		getEndDateInWorkingHours: function (oStartDate, mQuantity, mProductivity, oShift) {
			// also works for calculating remaining duration after new measurement or after re-start
			// in these cases otartDate is the date from which the rest of the work is calculated
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
			if (this.getShiftEnd(oCurrentTime, oShift) === oCurrentTime) {
				oCurrentTime = this.getNextShiftStart(oCurrentTime, oShift);
			}
			return oCurrentTime;
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
					sWorkerID = oWorkerBC.getProperty("worker_ID");
					mRate = oWorkerBC.getProperty("worker/wageClass/rate");
					aAllWorkerValues.push({
						ID: sWorkerID,
						rate: mRate
					});
				}
			}
			if (aCrewsPaths) {
				for (i = 0; i < aCrewsPaths.length; i++) {
					oCrewBC = oModel.createBindingContext("/" + aCrewsPaths[i]);
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
			return aAllWorkerValues;
		},

		getWorkingTimesInShiftPart: function (oStart, oEnd, oShiftPart, oCurrentTime) {
			var bLastShiftPart = (oCurrentTime.getTime() + this.getRemainingDurationHoursOfShiftPart(oCurrentTime, oShiftPart) * 60 * 60 * 1000) >=
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
			sMsgSucc = this.getResourceBundle().getText("successCreatingTimesheet", [aAllWorkers.length]);
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

		getPlannedLabourValues: function (oTask) {
			var aAllWorkers,
				aShiftPartsPlanned,
				oReturn = {
					hours: 0,
					cost: 0,
				},
				mHours = 0,
				mRate = 0;

			if (!oTask) {
				return undefined;
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
			oReturn.cost = parseFloat(String(oReturn.cost)).toFixed(2);
			return oReturn;
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

		////////////////////////////////////////////// HELPER FUNCTIONS ///////////////////////////////////////

		getPreviousTask: function (oTask) {
			// oTask is the oData object, NOT the element
			// the tasks need to be read from the backend because they might not be in the list of a foreman
			var oModel = this.getModel(),
				sLocationPath = "/" + oModel.createKey("Locations", {
					ID: oTask.location_ID
				}),
				sTasksPath = sLocationPath + "/tasks",
				aTasks,
				iStart1, iStart2,
				oPreviousTask;

			return new Promise(function (resolve) {
				oModel.read(sTasksPath, {
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							aTasks = oData.results;
							// find the task with the start date closest to oTask.startDate
							// this will find a task that ended before as well as an overlapping task 
							aTasks.sort(function (a, b) { // sort descendent
								iStart1 = a.status > 1 ? a.actualStart.getTime() : a.plannedStart.getTime();
								iStart2 = b.status > 1 ? b.actualStart.getTime() : b.plannedStart.getTime();
								return iStart2 - iStart1;
							});
							for (var i = 0; i < aTasks.length; i++) {
								iStart1 = aTasks[i].status > 1 ? aTasks[i].actualStart.getTime() : aTasks[i].plannedStart.getTime();
								iStart2 = oTask.status > 1 ? oTask.actualStart.getTime() : oTask.plannedStart.getTime();
								// oTask is not started yet; but to use method in general
								if (iStart1 < iStart2) {
									oPreviousTask = aTasks[i];
									break;
								}
							}
							resolve(oPreviousTask);
						} else {
							resolve(); // no previous task
						}
					},
					error: function (oError) {
						Log.error("Error reading tasks of location in getPreviousTask: " + JSON.stringify(oError));
						resolve();
					}
				});
			});
		},

		////////////////////////////////////////////// OPERATIVE HELPER FUNCTIONS ///////////////////////////////////////

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
				getCumulativeMeasurement = function () {
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
				oNow = new Date(),
				oShift = this.getShiftFromID(oTask.shift_ID),
				that = this;
			getCumulativeMeasurement().then(function (cumulativeValueArray) { // must read from db as oModel doesn't include the last measurement
				actualQuantity = cumulativeValueArray[0];
				actualDuration = cumulativeValueArray[1];
				if (!actualQuantity || actualQuantity === 0 || Number(actualQuantity) < Number(oTask.quantity)) {
					// if oNow is not in shift, set oNow to the last shift end
					if (!that.inShift(oNow, oShift)) {
						oNow = that.getShiftEnd(oNow, oShift);
					}
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
						success: function (oData) {
							MessageToast.show(that.getResourceBundle().getText("messageMeasurementAdded"));
							// update task after new measurement
							// oTask estimated end had been adjusted already
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
							that.saveResultToRecipe(oTask, [actualQuantity, actualDuration]);
						},
						error: function (oError) {
							MessageBox.error("Error saving final measurement");
						}
					});
				} else {
					that.saveResultToRecipe(oTask, [actualQuantity, actualDuration]);
				}
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
				aCrewMembers,
				oCrewBC;

			for (var i = 0; i < aCrews.length; i++) {
				oCrewBC = oModel.createBindingContext("/" + aCrews[i]);
				aCrewMembers = oCrewBC.getProperty("crew/crewMembers");
				iHeadCount += aCrewMembers ? aCrewMembers.length : 0;
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
		}

	});
});