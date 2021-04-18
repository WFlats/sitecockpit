sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment, Filter, FilterOperator, Sorter, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.Crews", {

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
				mode: "None",
				enableSave: false,
				lineItemTableDelay: 0,
				crewsTitle: this.getResourceBundle().getText("editCrewTitle"),
				crewID: "",
				crewPath: "",
				crewName: "",
				crewMembersListTitle: "",
				countCrewMembers: 0,
				oldChargeHandID: "",
				newChargeHandID: "",
				crewMemberSelected: false,
				countAvailableWorkers: 0,
				availableWorkersListTitle: "",
				availableWorkerSelected: false
			});
			this.setModel(oViewModel, "crewsView");

			this.getRouter().getRoute("Crews").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onObjectMatched: function (oEvent) {
			var sObjectId = oEvent.getParameter("arguments").objectId,
				sPath;

			if (this.getModel("appView").getProperty("mode") === "Create" || sObjectId === "xxx") {
				this.getModel("crewsView").setProperty("/crewsTitle", this.getResourceBundle().getText("createCrewTitle"));
				this.byId("name").setValue("");
			} else {
				this.getModel("crewsView").setProperty("/crewsTitle", this.getResourceBundle().getText("editCrewTitle"));
				this.getModel("crewsView").setProperty("/crewID", sObjectId);
				this.getModel().metadataLoaded().then(function () {
					sPath = this.getModel().createKey("Crews", {
						ID: sObjectId
					});
					this.getModel("crewsView").setProperty("/crewPath", sPath);
					this._bindView("/" + sPath);
				}.bind(this));
			}
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("crewsView");

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
				oElementBinding = oView.getElementBinding(),
				oViewModel = this.getModel("crewsView"),
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCrewPath = this.getModel("crewsView").getProperty("/crewPath");

			if (!sProjectID) {
				return; // initial rendering; appView not available
			}
			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				return;
			}

			// save old charge hand ID, crew name to detect changes (enableSave)
			var oCrew = oModel.getObject("/" + sCrewPath);
			if (oCrew) {
				oViewModel.setProperty("/oldChargeHandID", oCrew.chargeHand_ID);
				oViewModel.setProperty("/crewName", oCrew.crewName);
				var aItems = this.byId("crewMembersList").getItems();
				// select radiobox of charge hand
				for (var i = 0; i < aItems.length; i++) {
					if (aItems[i].getBindingContext().getObject().ID === oCrew.chargeHand_ID) {
						aItems[i].getAggregation("cells")[5].setSelected(true);
					}
				}
			}
			/*
						// sort crew members list not working
						var aSorter = [new Sorter({
							path: "company/companyName",
							descending: false,
							group: true
						}), new Sorter({
							path: "lastName",
							descending: false
						})];
						this.byId("crewMembersList").getBinding("items").sort(aSorter, "Application");
			*/
			// filter the workers list
			this.onSearch();
		},

		///////////////////////////////////CREWMEMBERLIST////////////////////////////////////////

		onCrewMembersListUpdateFinished: function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("crewsView"),
				oCrewList = this.byId("crewMembersList"),
				aCrewMembers;

			// only update the counter if the length is final
			if (oCrewList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("crewMemberListTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("crewMemberListTitleEmpty");
				}
				oViewModel.setProperty("/crewMembersListTitle", sTitle);
				oViewModel.setProperty("/countCrewMembers", iTotalItems);

				// deselect all (copied persons are selected)
				aCrewMembers = oCrewList.getItems();
				for (var i = 0; i < aCrewMembers.length; i++) {
					oCrewList.setSelectedItem(aCrewMembers[i], false);
				}
				oViewModel.setProperty("/crewMemberSelected", false);
			}
		},

		onSelectionChange: function (oEvent) {
			var aSelectedItems = this.byId("crewMembersList").getSelectedItems();
			if (aSelectedItems.length > 0) {
				this.getModel("crewsView").setProperty("/crewMemberSelected", true);
			} else {
				this.getModel("crewsView").setProperty("/crewMemberSelected", false);
			}
		},

		_validCrewName: function (sName) {
			return sName && sName.length > 0;
		},

		_crewNameChanged: function (sName) {
			return sName !== this.getModel("crewsView").getProperty("/crewName");
		},

		_chargeHandChanged: function () {
			var oViewModel = this.getModel("crewsView");
			return oViewModel.getProperty("/oldChargeHandID") !== oViewModel.getProperty("/newChargeHandID");
		},

		_validateCrewName: function () {
			var oName = this.byId("name"),
				sName = oName.getValue(),
				bSaveEnabled = this._validCrewName(sName) && this._crewNameChanged(sName) || this._chargeHandChanged();

			this.getModel("crewsView").setProperty("/enableSave", bSaveEnabled);

			if (!sName || sName.length === 0) {
				oName.setValueState("Error");
				oName.setValueStateText("Please enter a crew name");
			} else {
				oName.setValueState("None");
				oName.setValueStateText("");
			}
		},

		onChargeHandSelect: function (oEvent) {
			var oItem = oEvent.getSource().getParent(),
				bSelected = oEvent.getParameter("selected"),
				oViewModel = this.getModel("crewsView"),
				sName = this.byId("name").getValue();
			if (bSelected) {
				var sNewChargeHandID = oItem.getBindingContext().getObject().ID;
				oViewModel.setProperty("/newChargeHandID", sNewChargeHandID);
			}
			// set enableSave if a new charge hand was selected
			if (this._chargeHandChanged() || this._crewNameChanged(sName) && this._validCrewName(sName)) {
				oViewModel.setProperty("/enableSave", true);
			} else {
				oViewModel.setProperty("/enableSave", false);
			}
		},

		onSaveCrew: function () {
			var oCrewBC,
				oModel = this.getModel(),
				oViewModel = this.getModel("crewsView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCrewName = this.byId("name").getValue(),
				sChargeHandID = oViewModel.getProperty("/newChargeHandID") || undefined;

			if (this.getModel("appView").getProperty("/mode") === "Edit") { // edit
				oCrewBC = this.getView().getElementBinding().getBoundContext();
				oModel.setProperty("chargeHand_ID", sChargeHandID, oCrewBC);
				if (sCrewName !== oViewModel.getProperty("/crewName")) {
					this._nextCrewNumber(sProjectID, sCrewName).then(function (iNumber) {
						oModel.setProperty("crewName", sCrewName, oCrewBC);
						oModel.setProperty("crewNumber", iNumber, oCrewBC);
						oModel.submitChanges();
					});
				} else {
					oModel.submitChanges();
				}
			} else { // create
				this._nextCrewNumber(sProjectID, sCrewName).then(function (iNumber) {
					oModel.createEntry("/Crews", {
						properties: {
							project_ID: sProjectID,
							crewName: sCrewName,
							crewNumber: iNumber
						}
					});
					oModel.submitChanges();
				});
			}
			oViewModel.setProperty("/enableSave", false);
			oViewModel.setProperty("/crewMemberSelected", false);
			this.getView().unbindObject();
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
		},

		_nextCrewNumber: function (sProjectID, sCrewName) {
			var oModel = this.getModel(),
				sPath = "/Crews",
				aFilter = [
					new Filter({
						path: "crewName",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sCrewName
					}),
					new Filter({
						path: "project_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sProjectID
					})
				],
				aSorter = [new Sorter({
					path: "crewNumber",
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
							resolve(oData.results[0].crewNumber + 1);
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

		onDeleteCrew: function () {
			var sCrewPath = this.getView().getElementBinding().getBoundContext().getPath(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("confirmCrewDeletionTitle"),
				sConfirmText = this.getResourceBundle().getText("confirmCrewDeletionText"),
				that = this,
				aCrewMembers = [],
				oBC;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							that.getModel("crewsView").setProperty("/enableSave", false);
							aCrewMembers = that.byId("crewMembersList").getItems();
							oModel.remove(sCrewPath, {
								success: function () {
									// remove crew member assignments
									for (var i = 0; i < aCrewMembers.length; i++) {
										oBC = aCrewMembers[i].getBindingContext();
										oModel.setProperty("memberOfCrew_ID", null, aCrewMembers[i].getBindingContext());
									}
									oModel.submitChanges();
								}
							});
							that.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
							that.getRouter().navTo("object", {
								objectId: sProjectID
							});
						}
					}
				}
			);
		},

		onRemoveCrewMembers: function () {
			var oCrewList = this.byId("crewMembersList"),
				aSelectedItems = oCrewList.getSelectedItems(),
				oWorkerList = this.byId("workersList"),
				oModel = this.getModel(),
				oView = this.getModel("crewsView"),
				oCrewMemberBC;
			for (var i = 0; i < aSelectedItems.length; i++) {
				oCrewMemberBC = aSelectedItems[i].getBindingContext();
				oModel.setProperty("memberOfCrew_ID", null, oCrewMemberBC);
			}
			oModel.submitChanges({
				success: function (oResult) {
					oCrewList.getBinding("items").refresh();
					oWorkerList.getBinding("items").refresh();
					oView.setProperty("/crewMemberSelected", false);
				}
			});
		},

		onAssignWorkersToCrewDnD: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oModel = this.getModel(),
				sCrewID = this.getModel("crewsView").getProperty("/crewID"),
				oCrewList = this.byId("crewMembersList");
			if (!oDraggedItemContext) {
				return;
			}
			oModel.setProperty("memberOfCrew_ID", sCrewID, oDraggedItemContext);
			oModel.submitChanges({
				success: function (oResult) {
					oCrewList.getBinding("items").refresh();
				}
			});
		},

		//////////////////////////////// AVAILABLE WORKERS /////////////////////////////

		onWorkerListUpdateFinished: function (oEvent) {
			this._updateWorkerListItemCount(oEvent.getParameter("total"));
		},

		_updateWorkerListItemCount: function (iTotalItems) {
			var sTitle,
				oViewModel = this.getModel("crewsView");
			// only update the counter if the length is final
			if (this.byId("workersList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("availableWorkersForCrewListTitle", [iTotalItems]);
				oViewModel.setProperty("/availableWorkersListTitle", sTitle);
				oViewModel.setProperty("/countAvailableWorkers", iTotalItems);
			}
		},

		onWorkersSelectionChange: function () {
			var aSelectedWorkers = this.byId("workersList").getSelectedItems(),
				oViewModel = this.getModel("crewsView");
			if (aSelectedWorkers && aSelectedWorkers.length > 0) {
				oViewModel.setProperty("/availableWorkerSelected", true);
			} else {
				oViewModel.setProperty("/availableWorkerSelected", false);
			}
		},

		onAssignWorkersToCrew: function () {
			var oWorkerList = this.byId("workersList"),
				oCrewList = this.byId("crewMembersList"),
				aSelectedWorkers = oWorkerList.getSelectedItems(),
				oModel = this.getModel(),
				oView = this.getModel("crewsView"),
				sCrewID = this.getModel("crewsView").getProperty("/crewID"),
				oBC;

			for (var i = 0; i < aSelectedWorkers.length; i++) {
				oBC = aSelectedWorkers[i].getBindingContext();
				oModel.setProperty("memberOfCrew_ID", sCrewID, oBC);
			}
			oModel.submitChanges({
				success: function (oResult) {
					oWorkerList.getBinding("items").refresh();
					oCrewList.getBinding("items").refresh();
					oView.setProperty("/availableWorkerSelected", false);
				}
			});
		},

		onRemoveCrewMembersDnD: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oList = this.byId("workersList").getBinding("items"),
				oModel = this.getModel();
			if (!oDraggedItemContext) {
				return;
			}
			oModel.setProperty("memberOfCrew_ID", null, oDraggedItemContext);
			oModel.submitChanges({
				success: function (oResult) {
					oList.refresh();
				}
			});
		},

		onSearch: function (oEvent) {
			if (oEvent && oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.byId("workersList").getBinding("items").refresh();
				return;
			}

			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sQuery = "",
				aFilters = [];

			if (!sProjectID) {
				return;
			}
			if (oEvent) {
				sQuery = oEvent.getParameter("query");
			}
			if (sQuery) {
				//aSearch = new Filter("profession/description", FilterOperator.Contains, sQuery);
				aFilters = [new Filter({
					filters: [
						new Filter("deployment/project_ID", FilterOperator.EQ, sProjectID),
						new Filter("memberOfCrew_ID", FilterOperator.EQ, null),
						new Filter("profession/description", FilterOperator.Contains, sQuery)
					],
					and: true
				})];
			} else {
				aFilters = [new Filter({
					filters: [
						new Filter("deployment/project_ID", FilterOperator.EQ, sProjectID),
						new Filter("memberOfCrew_ID", FilterOperator.EQ, null)
					],
					and: true
				})];
			}
			this.byId("workersList").getBinding("items").filter(aFilters, "Application");
		},

		/////////////////////////////////////////////////////////////

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		},

		onCloseDetailPress: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCrewPath = this.getModel("crewsView").getProperty("/crewPath"),
				sConfirmTitle = this.getResourceBundle().getText("discardChangesConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("discardChangesConfirmationText"),
				that = this;

			if (this.getModel("crewsView").getProperty("/enableSave")) {
				MessageBox.confirm(
					sConfirmText, {
						icon: MessageBox.Icon.WARNING,
						title: sConfirmTitle,
						actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
						initialFocus: MessageBox.Action.CANCEL,
						onClose: function (sAction) {
							if (sAction === "OK") {
								that.getModel("crewsView").setProperty("/enableSave", false);
								that.getModel("crewsView").setProperty("/crewMemberSelected", false);
								oModel.resetChanges(sCrewPath);
								that.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
								that.getRouter().navTo("object", {
									objectId: sProjectID
								});
							}
						}
					}
				);
			} else {
				this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
				this.getRouter().navTo("object", {
					objectId: sProjectID
				});
			}
		}

	});

});