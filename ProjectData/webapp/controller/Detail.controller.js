sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"../model/formatter",
	"sap/m/library",
	"sap/ui/core/format/DateFormat",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/Dialog"
], function (BaseController, Filter, FilterOperator, Sorter, GroupHeaderListItem, JSONModel, Device, formatter, mobileLibrary, DateFormat,
	MessageBox,
	MessageToast,
	Dialog) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("project.data.ProjectData.controller.Detail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
					busy: false,
					delay: 0,
					countCompanies: 0,
					companyListTitle: this.getResourceBundle().getText("detailLineItemTableHeading"),
					companySelected: false,
					countUsers: 0,
					userListTitle: this.getResourceBundle().getText("userListTitle"),
					userSelected: false,
					workersListTitle: "",
					countWorkers: 0,
					workerSelected: false,
					countCrews: 0,
					crewsListTitle: "",
					specialDatesListTitle: "",
					countSpecialDates: 0,
					timeTypesListTitle: "",
					countTimeTypes: 0,
					shiftsListTitle: "",
					countShifts: 0
				}),
				oData = {
					"days": [{
						"number": 1,
						"name": this.getResourceBundle().getText("Monday")
					}, {
						"number": 2,
						"name": this.getResourceBundle().getText("Tuesday")
					}, {
						"number": 3,
						"name": this.getResourceBundle().getText("Wednesday")
					}, {
						"number": 4,
						"name": this.getResourceBundle().getText("Thursday")
					}, {
						"number": 5,
						"name": this.getResourceBundle().getText("Friday")
					}, {
						"number": 6,
						"name": this.getResourceBundle().getText("Saturday")
					}, {
						"number": 0,
						"name": this.getResourceBundle().getText("Sunday")
					}]
				},
				Weekdays = new JSONModel(oData);
			this.setModel(Weekdays, "Weekdays");

			this.setModel(oViewModel, "detailView");

			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);
			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},

		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function () {
			var oViewModel = this.getModel("detailView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});

			oShareDialog.open();
		},

		onTabSelect: function () {
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
		},

		///////////////////////// Status change/Create/Edit Project ////////////////////////////////

		onProjectStatePress: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				iStatus = oBC.getProperty("status");

			MessageBox.confirm(
				this.getResourceBundle().getText("confirmStatusMessage"), {
					actions: [MessageBox.Action.YES, MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (oAction) {
						if (oAction === sap.m.MessageBox.Action.YES) {
							oModel.setProperty("status", iStatus + 1, oBC);
							if (iStatus === 0) {
								oModel.setProperty("actualStartDate", new Date(), oBC);
							} else if (iStatus === 1) {
								oModel.setProperty("actualEndDate", new Date(), oBC);
							}
							oModel.submitChanges();
						}
					}
				}
			);
		},

		onEditProject: function () {
			var sObjectId = this.getView().getBindingContext().getProperty("ID");
			//sObjectId = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().getTargets().display("CreateProject", {
				mode: "Edit",
				objectId: sObjectId
			});
		},

		onAddProject: function () {
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/mode", "Create");
			this.getRouter().getTargets().display("CreateProject", {
				mode: "Create",
				objectId: ""
			});
		},

		onDeleteProject: function () {
			var sObjectId = this.getView().getBindingContext().getProperty("ID"),
				oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Projects", {
					ID: sObjectId
				}),
				sConfirmText = this.getResourceBundle().getText("confirmDeleteProject"),
				sConfirmTitle = this.getResourceBundle().getText("confirmDeleteProjectTitle");

			MessageBox.warning(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath, {
								success: function (oResult) {
									MessageToast.show("Project successfully deleted");
								},
								error: function (oError) {
									MessageToast.show("Error deleting project");
								}
							});
						}
					}
				}
			);
			this.onCloseDetailPress();
		},

		////////////////////////////// USERS /////////////////////////////////////////

		onUserListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (this.byId("userList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("userListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("userListTitleEmpty");
				}
				oViewModel.setProperty("/userListTitle", sTitle);
				oViewModel.setProperty("/countUsers", iTotalItems);
			}
		},

		onUserSelectionChange: function (oEvent) {
			var aSelectedUsers = this.byId("userList").getSelectedItems(),
				oViewModel = this.getModel("detailView");
			if (aSelectedUsers && aSelectedUsers.length > 0) {
				oViewModel.setProperty("/userSelected", true);
			} else {
				oViewModel.setProperty("/userSelected", false);
			}
		},

		onEditUserList: function () {
			var bReplace = !Device.system.phone;
			//sID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			/*this.getRouter().navTo("Users", {doesn't work; Projects/{objectId} not accepted as a route pattern
				mode: "Drag",
				objectId: sID
			}, bReplace); */

			this.getRouter().navTo("Users", bReplace);
		},

		onAddUser: function (oEvent) { //DnD event
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oDraggedItemID = oDraggedItemContext.getProperty("ID"),
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			if (!oDraggedItemContext) {
				return;
			}
			oModel.createEntry("UsersOfProject", {
				properties: {
					project_ID: sProjectID,
					person_ID: oDraggedItemID
				}
			});
			oModel.submitChanges();
		},

		onRemoveUser: function () {
			var aSelectedUsers = this.byId("userList").getSelectedItems(),
				oViewModel = this.getModel("detailView"),
				oModel = this.getModel(),
				sAssignedUserID = "",
				sPath;
			if (!aSelectedUsers || aSelectedUsers.length === 0) {
				return;
			}
			oViewModel.setProperty("/userSelected", false);
			for (var i = 0; i < aSelectedUsers.length; i++) {
				sAssignedUserID = aSelectedUsers[i].getBindingContext().getProperty("ID");
				sPath = "/" + oModel.createKey("UsersOfProject", {
					ID: sAssignedUserID
				});
				oModel.remove(sPath);
			}
		},

		////////////////////////////// COMPANIES /////////////////////////////////////////

		onCompanyListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				aCompanyDisciplines = [],
				oViewModel = this.getModel("detailView"),
				oModel = this.getModel(),
				aCompaniesOfProject,
				that = this;

			if (this.byId("companyList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/companyListTitle", sTitle);
				oViewModel.setProperty("/countCompanies", iTotalItems);
				// find the IDs of DisciplinesOfCompanies entities that relate to the CompaniesForProjects entities and
				// store them in the appView so they can be used for filter building in the Companies view
				aCompaniesOfProject = this.getView().getBindingContext().getProperty("companies"); // getItems also gets groupHeaders
				for (var i = 0; i < aCompaniesOfProject.length; i++) {
					aCompanyDisciplines.push({
						company: oModel.createBindingContext("/" + aCompaniesOfProject[i]).getProperty("company_ID"),
						discipline: oModel.createBindingContext("/" + aCompaniesOfProject[i]).getProperty("discipline_ID")
					})
				}
				if (aCompanyDisciplines.length === 0) {
					this.getModel("appView").setProperty("/excludeDisciplineIDs", []);
				} else {
					this.buildExcludeIDs(aCompanyDisciplines); // saves to appView
				}
			}
		},

		buildExcludeIDs: function (aCompanyDisciplines) {
			var oModel = this.getModel(),
				aFilters = [],
				aExcludeIDs = [],
				that = this;
			// build filters to read the entities to exclude
			for (var i = 0; i < aCompanyDisciplines.length; i++) {
				aFilters.push(new Filter({
					filters: [
						new Filter("discipline_ID", FilterOperator.EQ, aCompanyDisciplines[i].discipline),
						new Filter("company_ID", FilterOperator.EQ, aCompanyDisciplines[i].company)
					],
					and: true
				}))
			}
			oModel.read("/DisciplinesOfCompanies", {
				filters: [new Filter({
					filters: aFilters,
					and: false
				})],
				success: function (oData) {
					for (i = 0; i < oData.results.length; i++) {
						aExcludeIDs.push(oData.results[i].ID);
					}
					that.getModel("appView").setProperty("/excludeDisciplineIDs", aExcludeIDs);
				}
			});
		},

		onEditCompanies: function () {
			var bReplace = !Device.system.phone,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");

			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Companies", {
				objectId: sProjectID
			}, bReplace);
		},

		onRemoveCompany: function () {
			var aSelectedCompanies = this.byId("companyList").getSelectedItems(),
				oViewModel = this.getModel("detailView"),
				oModel = this.getModel();

			if (!aSelectedCompanies || aSelectedCompanies.length === 0) {
				return;
			}

			oViewModel.setProperty("/companySelected", false);
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			aSelectedCompanies.reduce(function (v, oCompany, i) {
				new Promise(function () {
					var sCompanyPath = oCompany.getBindingContext().getPath();

					oModel.remove(sCompanyPath);
				});
			}, Promise.resolve());
		},

		onAddCompany: function (oEvent) { //DnD event
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oDraggedItemID = oDraggedItemContext.getProperty("company_ID"), // DisciplinesOfCompany
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oCompany = {};
			if (!oDraggedItemContext) {
				return;
			}
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			oCompany.project_ID = sProjectID;
			oCompany.company_ID = oDraggedItemID;
			oCompany.discipline_ID = oDraggedItemContext.getProperty("discipline_ID");
			oModel.create("/CompaniesForProjects", oCompany);
		},

		onCompanySelectionChange: function () {
			var aSelectedCompanies = this.byId("companyList").getSelectedItems(),
				oViewModel = this.getModel("detailView");
			if (aSelectedCompanies && aSelectedCompanies.length > 0) {
				oViewModel.setProperty("/companySelected", true);
			} else {
				oViewModel.setProperty("/companySelected", false);
			}
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("discipline"),
				oGroup;
			if (oDiscipline) {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			} else {
				oGroup = {
					key: "",
					description: this.getResourceBundle().getText("noDisciplineAssigned")
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.key + " " + oGroup.description,
				upperCase: false
			});
		},

		////////////////////////////// WORKERS /////////////////////////////////////////

		onWorkersListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView"),
				oBinding = this.byId("workersList").getBinding("items");

			// only update the counter if the length is final
			if (oBinding.isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("workersListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("workersListTitleEmpty");
				}
				oViewModel.setProperty("/workersListTitle", sTitle);
				oViewModel.setProperty("/countWorkers", iTotalItems);
			}
		},

		onDeployedWorkerSelectionChange: function (oEvent) {
			var aSelectedWorkers = this.byId("workersList").getSelectedItems(),
				oViewModel = this.getModel("detailView");
			if (aSelectedWorkers && aSelectedWorkers.length > 0) {
				oViewModel.setProperty("/workerSelected", true);
			} else {
				oViewModel.setProperty("/workerSelected", false);
			}
		},

		onEditWorkers: function () {
			var bReplace = !Device.system.phone,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Workers", {
				objectId: sProjectID
			}, bReplace);
		},

		onAddWorker: function (oEvent) { //DnD event
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oDraggedItemID = oDraggedItemContext.getProperty("ID"),
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oList = this.byId("workersList"),
				oWorkerDeployment = {};
			if (!oDraggedItemContext) {
				return;
			}
			oWorkerDeployment.project_ID = sProjectID;
			oWorkerDeployment.worker_ID = oDraggedItemID;
			oWorkerDeployment.deploymentStart = this.getModel("appView").getProperty("/deploymentStart");
			oWorkerDeployment.deploymentEnd = this.getModel("appView").getProperty("/deploymentEnd");
			oWorkerDeployment.deploymentStart = this.adjustUTC(oWorkerDeployment.deploymentStart);
			oWorkerDeployment.deploymentEnd = this.adjustUTC(oWorkerDeployment.deploymentEnd);
			oModel.create("/WorkerDeployments", oWorkerDeployment, {
				success: function (oData) {
					oModel.setProperty("deployment_ID", oData.ID, oDraggedItemContext);
					oModel.submitChanges({
						success: function (oResult) {
							oList.getBinding("items").refresh();
						}
					});
				}
			});
		},

		onRemoveWorker: function () {
			var aSelectedWorkers = this.byId("workersList").getSelectedItems(),
				oViewModel = this.getModel("detailView"),
				oModel = this.getModel();

			if (!aSelectedWorkers || aSelectedWorkers.length === 0) {
				return;
			}
			// worker list is /Persons!
			oViewModel.setProperty("/workerSelected", false);
			aSelectedWorkers.reduce(function (v, oWorker, i) {
				new Promise(function () {
					var oWorkerBC = oWorker.getBindingContext(),
						sWorkerPath = oWorkerBC.getPath(),
						sDeploymentID = oModel.getObject(sWorkerPath).deployment_ID,
						sDeploymentPath = "/" + oModel.createKey("WorkerDeployments", {
							ID: sDeploymentID
						});
					oModel.remove(sDeploymentPath, {
						success: function (oResult) {
							// update Person entity
							oModel.setProperty("deployment_ID", null, oWorkerBC);
							// also remove worker from crew
							oModel.setProperty("memberOfCrew_ID", null, oWorkerBC);
							oModel.submitChanges();
						}
					});
				});
			}, Promise.resolve());
		},

		onSearchWorker: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.byId("workersList").getBinding("items").refresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");
			this._filterWorkerList(sQuery);
		},

		////////////////////////////// CREWS /////////////////////////////////////////

		onCrewsListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (this.byId("crewsList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("crewsListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("crewsListTitleEmpty");
				}
				oViewModel.setProperty("/crewsListTitle", sTitle);
				oViewModel.setProperty("/countCrews", iTotalItems);
			}
		},

		onEditCrew: function (oEvent) {
			var bReplace = !Device.system.phone,
				sID = oEvent.getSource().getBindingContext().getProperty("ID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Crews", {
				objectId: sID
			}, bReplace);

		},

		onAddCrew: function (oEvent) {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/mode", "Create");

			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Crews", {
				objectId: "xxx"
			}, bReplace);
		},

		////////////////////////////// SHIFTS /////////////////////////////////////////

		onShiftsListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (this.byId("shiftsList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("shiftsListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("shiftsListTitleEmpty");
				}
				oViewModel.setProperty("/shiftsListTitle", sTitle);
				oViewModel.setProperty("/countShifts", iTotalItems);
			}
		},

		onEditShift: function (oEvent) {
			var bReplace = !Device.system.phone,
				sID = oEvent.getSource().getBindingContext().getProperty("ID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Shifts", {
				mode: "Edit",
				objectId: sID
			}, bReplace);

		},

		onAddShift: function (oEvent) {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/mode", "Create");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Shifts", {
				mode: "Create",
				objectId: "xxx"
			}, bReplace);
		},

		////////////////////////////// TIME TYPES /////////////////////////////////////////

		onTimeTypesListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (this.byId("timeTypesList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("timeTypesListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("timeTypesListTitleEmpty");
				}
				oViewModel.setProperty("/timeTypesListTitle", sTitle);
				oViewModel.setProperty("/countTimeTypes", iTotalItems);
			}
		},

		onEditTimeType: function (oEvent) {
			var bReplace = !Device.system.phone,
				sID = oEvent.getSource().getBindingContext().getProperty("ID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsMidExpanded");
			this.getRouter().navTo("TimeTypes", {
				mode: "Edit",
				objectId: sID
			}, bReplace);

		},

		onAddTimeType: function (oEvent) {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/mode", "Create");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsMidExpanded");
			this.getRouter().navTo("TimeTypes", {
				mode: "Create",
				objectId: "xxx"
			}, bReplace);
		},

		////////////////////////////// Holidays /////////////////////////////////////////

		onSpecialDatesListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");
			// only update the counter if the length is final
			if (this.byId("specialDatesList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("specialDatesListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("specialDatesListTitleEmpty");
				}
				oViewModel.setProperty("/specialDatesListTitle", sTitle);
				oViewModel.setProperty("/countSpecialDates", iTotalItems);
			}
		},

		getWeekendDays: function (sProjectID) {
			var oModel = this.getModel(),
				aFilters = [new Filter({
					path: "project_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sProjectID
				}), new Filter({
					path: "description",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: "Weekend Day"
				})];
			return new Promise(function (resolve, reject) {
				oModel.read("/SpecialDates", {
					urlParameters: {
						$inlinecount: "allpages"
					},
					filters: aFilters,
					success: function (aWeekendDays) {
						if (aWeekendDays.results.length > 0) {
							resolve(aWeekendDays.results);
						} else {
							resolve([]);
						}
					},
					error: function () {
						resolve([]);
					}
				});
			});
		},

		onEditSpecialDate: function (oEvent) {
			var bReplace = !Device.system.phone,
				sID = oEvent.getSource().getBindingContext().getProperty("ID");
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsMidExpanded");
			this.getRouter().navTo("SpecialDates", {
				mode: "Edit",
				objectId: sID
			}, bReplace);

		},

		onAddSpecialDate: function (oEvent) { //DnD event
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/mode", "Create");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsMidExpanded");
			this.getRouter().navTo("SpecialDates", {
				mode: "Create",
				objectId: "xxx"
			}, bReplace);
		},

		onWeekendSelectionFinish: function (oEvent) {
			var aSelectedItems = oEvent.getParameter("selectedItems"),
				sWeekDay,
				oWeekendDate,
				aWeekendDates = [],
				oViewModel = this.getModel("detailView"),
				oModel = this.getModel(),
				oData,
				sPath,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");

			oViewModel.setProperty("/busy", true);
			this.getWeekendDays(sProjectID).then(function (aWeekendDays) {
				// delete existing weekend days
				aWeekendDays.reduce(function (p, v, j, aArray) {
					new Promise(function (resolve) {
						sPath = oModel.createKey("/SpecialDates", {
							ID: v.ID
						});
						oModel.remove(sPath);
					});
				}, Promise.resolve());
				for (var i = 0; i < aSelectedItems.length; i++) {
					oWeekendDate = new Date();
					sWeekDay = aSelectedItems[i].getProperty("key");
					oWeekendDate.setFullYear(9999, sWeekDay); // year 9999 for weekend, month for weekday
					aWeekendDates.push(oWeekendDate);
				}
				oViewModel.setProperty("/busy", false); // in case no weekend days were defined
				// create new weekend days
				aWeekendDates.reduce(function (q, w, k, aArray) {
					new Promise(function (resolve) {
						oData = {
							project_ID: sProjectID,
							specialDate: w,
							description: "Weekend Day"
						};
						oViewModel.setProperty("/busy", true);
						oModel.create("/SpecialDates", oData, {
							success: function (oDataResult) {
								oViewModel.setProperty("/busy", false);
							},
							error: function (oError) {
								oViewModel.setProperty("/busy", false);
							}
						});
					});
				}, Promise.resolve());
			});
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			var sObjectId = oEvent.getParameter("arguments").objectId;
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/selectedProjectID", sObjectId);
			this.getModel().metadataLoaded().then(function () {
				var sObjectPath = this.getModel().createKey("Projects", {
					ID: sObjectId
				});
				this._bindView("/" + sObjectPath);
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onBindingChange: function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding 
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.ID,
				sObjectName = oObject.code,
				oViewModel = this.getModel("detailView");

			this.getOwnerComponent().oListSelector.selectAListItem(sPath);
			this._setDates();

			oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
			oViewModel.setProperty("/shareOnJamTitle", sObjectName);
			oViewModel.setProperty("/shareSendEmailSubject",
				oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
				oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));

			// filter special dates so that no weekend days are included
			//var oMaxDate = new Date(); filtering works but throws an assertion error:
			// Assertion failed: Type for filter property could not be found in metadata!
			//oMaxDate.setFullYear(9998); // 9999 is reserved for weekend days
			var aFilters = [new Filter({
					path: "description",
					operator: sap.ui.model.FilterOperator.NE,
					value1: "Weekend Day"
				})],
				oComboBox = this.byId("weekdaySelection"),
				aSelectedKeys = [];

			this.byId("specialDatesList").getBinding("items").filter(aFilters, "Application");

			// pre-select weekend days
			this.getWeekendDays(sObjectId).then(function (aWeekendDays) {
				for (var i = 0; i < aWeekendDays.length; i++) {
					aSelectedKeys.push(aWeekendDays[i].specialDate.getMonth());
				}
				oComboBox.setSelectedKeys(aSelectedKeys);
			});

			this._filterWorkerList(this.byId("searchField").getValue());

			// filter the time types of the project for the select in shifts view
			// revisit: outcommented because the model doesn't get propagated to the shifts view
			// the code is put into shifts.controller
			/*			var oModel = this.getModel(),
							getProjectTimeTypes = function (sTTPath) {
								return new Promise(function (resolve, reject) {
									oModel.read(sTTPath, {
										urlParameters: {
											$inlinecount: "allpages"
										},
										success: function (aProjectTimeTypes) {
											if (aProjectTimeTypes.results.length > 0) {
												resolve(aProjectTimeTypes.results);
											} else {
												resolve([]);
											}
										},
										error: function () {
											resolve([]);
										}
									});
								});
							},
							sTimeTypesPath = "/" + oModel.createKey("Projects", {
								ID: sProjectID
							}) + "/timeTypes",
							oItem = {},
							aTimeTypes = [],
							timeTypesModel = new sap.ui.model.json.JSONModel(),
							that = this;
						getProjectTimeTypes(sTimeTypesPath).then(function (aProjectTimeTypes) {
							for (var i = 0; i < aProjectTimeTypes.length; i++) {
								oItem = {
									ID: aProjectTimeTypes[i].ID,
									code: aProjectTimeTypes[i].code
								};
								aTimeTypes.push(oItem);
							}
							timeTypesModel.setData({
								timeTypesArray: aTimeTypes
							});
							that.setModel(timeTypesModel, "timeTypesModel");
						}); */
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("companyList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);

			oLineItemTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/delay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},

		_filterWorkerList: function (sQuery) {
			// sort and filter workers list
			// sort with 2 sorters and filtering with sProjectID from appView model didn't work in view
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oBinding = this.byId("workersList").getBinding("items"),
				aSorters = [
					new Sorter({
						path: "company/companyName",
						descending: false,
						group: true
					}),
					new Sorter({
						path: "lastName",
						descending: false
					})
				],
				aFilter = new Filter({
					path: "deployment/project_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sProjectID
				}),
				aSearchFilter,
				aFilters;

			if (sQuery) {
				aSearchFilter = new Filter("lastName", FilterOperator.Contains, sQuery);
				aFilters = [new Filter({
					filters: [
						aFilter,
						aSearchFilter
					],
					and: true
				})];
			} else {
				aFilters = [aFilter];
			}
			oBinding.sort(aSorters);
			oBinding.filter(aFilters, "Application");
		},

		_setDates: function () {
			var oDateFormat = DateFormat.getDateInstance({
					style: "short"
				}),
				oProject = this.getView().getBindingContext().getObject({
					select: "*"
				});
			switch (oProject.status) {
			case 1: // started
				this.byId("startAttr").setText(oDateFormat.format(oProject.actualStartDate));
				this.byId("endAttr").setText(oDateFormat.format(oProject.estimatedEndDate));
				break;
			case 2: // completed
				this.byId("startAttr").setText(oDateFormat.format(oProject.actualStartDate));
				this.byId("endAttr").setText(oDateFormat.format(oProject.actualEndDate));
				break;
			}
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}
	});

});